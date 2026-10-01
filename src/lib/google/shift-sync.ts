import { planShiftSync, resolveMissing, type LinkedShift, type MissingResolution, type PendingCheck, type SyncIssue, type SyncJob, type SyncPlan } from "@/lib/google-sync-plan";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getEvent, listEventsForSync } from "./client";
import { isGoogleCalendarEnabled } from "./config";
import { withCalendarAccess, type CalendarAccess } from "./connection";

/**
 * One sync run for one user: load the jobs that sync and their shifts in the
 * window, read Google, plan (google-sync-plan.ts), confirm with Google each
 * upcoming synced shift whose event went missing, then apply everything one
 * shift at a time through the RLS client, so the 24-hour limit, weekly caps,
 * overlaps and the pay snapshot are enforced by the same triggers as any shift.
 *
 * Order matters: removals and moves go before additions, so a republished
 * schedule does not collide with the shifts it replaces. A write the database
 * refuses becomes an issue for the Calendar page.
 *
 * The run is claimed through `claim_google_shift_sync`, which admits one run
 * per five minutes (thirty seconds for "Sync now") from a table the user cannot
 * write, so two tabs cannot both run it and nobody can reset the clock.
 */
const WINDOW_BACK_MS = 14 * 24 * 60 * 60_000;
const WINDOW_AHEAD_MS = 56 * 24 * 60 * 60_000;
const UNLINK = { google_calendar_id: null, google_event_id: null, google_adopted: false };

export type SyncResult = { status: "ok" | "skipped" | Exclude<CalendarAccess<unknown>["status"], "ok">; changed: number };

function reasonFor(message: string) {
  const normalized = message.toLowerCase();
  if (normalized.includes("global weekly limit")) return "over your weekly limit";
  if (normalized.includes("job weekly limit")) return "over this job's weekly limit";
  if (normalized.includes("shifts_no_overlap") || normalized.includes("exclusion constraint")) return "overlaps another shift";
  if (normalized.includes("shifts_no_duplicate_span") || normalized.includes("duplicate key")) return "already logged";
  if (normalized.includes("24 hours")) return "longer than 24 hours";
  return "couldn't be saved";
}

export async function syncGoogleShifts(profile: { id: string; time_zone: string }, { force = false } = {}): Promise<SyncResult> {
  if (!isGoogleCalendarEnabled()) return { status: "disabled", changed: 0 };
  const supabase = await createServerSupabaseClient();
  const { data: connection } = await supabase.from("google_calendar_connections").select("status,selected_calendar_ids").eq("user_id", profile.id).maybeSingle();
  if (!connection) return { status: "not_connected", changed: 0 };
  if (connection.status === "needs_reconnect") return { status: "needs_reconnect", changed: 0 };

  const { data: claimed } = await supabase.rpc("claim_google_shift_sync", { p_force: force });
  if (!claimed) return { status: "skipped", changed: 0 };
  const now = new Date();
  const selected = connection.selected_calendar_ids;

  const { data: jobRows } = await supabase.from("jobs").select("id,name,google_keyword,google_calendar_id,google_sync,google_sync_ignored").eq("user_id", profile.id).is("archived_at", null);
  const jobs: SyncJob[] = (jobRows ?? []).map((job) => ({ id: job.id, name: job.name, keyword: job.google_keyword, calendarId: job.google_calendar_id, sync: job.google_sync, ignored: job.google_sync_ignored }));
  const syncJobs = jobs.filter((job) => job.sync);
  if (syncJobs.length === 0) {
    await supabase.from("google_calendar_connections").update({ sync_issues: [] }).eq("user_id", profile.id);
    return { status: "ok", changed: 0 };
  }

  const range = { timeMin: new Date(now.getTime() - WINDOW_BACK_MS).toISOString(), timeMax: new Date(now.getTime() + WINDOW_AHEAD_MS).toISOString() };
  const { data: shiftRows, error: shiftError } = await supabase.from("shifts").select("id,job_id,starts_at,ends_at,google_calendar_id,google_event_id,google_adopted").eq("user_id", profile.id).in("job_id", syncJobs.map((job) => job.id)).gt("ends_at", range.timeMin).lt("starts_at", range.timeMax);
  if (shiftError) return { status: "unavailable", changed: 0 };
  const shifts: LinkedShift[] = (shiftRows ?? []).map((row) => ({ id: row.id, jobId: row.job_id, startsAt: row.starts_at, endsAt: row.ends_at, calendarId: row.google_calendar_id, eventId: row.google_event_id, adopted: row.google_adopted }));

  const calendarIds = [...new Set([...selected, ...syncJobs.flatMap((job) => (job.calendarId ? [job.calendarId] : []))])];
  const access = await withCalendarAccess(profile.id, async (token) => {
    const fetched = await listEventsForSync(token, calendarIds, range, profile.time_zone);
    const plan = planShiftSync({ events: fetched.events, jobs, shifts, selectedCalendarIds: selected, failedCalendarIds: fetched.failedCalendarIds, now });
    // Missing is not deleted: ask Google about each one. An answer we cannot
    // get leaves the shift exactly as it is.
    const resolved: { pending: PendingCheck; resolution: MissingResolution }[] = [];
    for (const pending of plan.verify) {
      try {
        resolved.push({ pending, resolution: resolveMissing(pending, await getEvent(token, pending.calendarId, pending.eventId, profile.time_zone), jobs, selected) });
      } catch {
        resolved.push({ pending, resolution: { action: "keep" } });
      }
    }
    return { plan, resolved };
  });
  if (access.status !== "ok") return { status: access.status, changed: 0 };

  const issues = await applyPlan(supabase, profile.id, jobs, access.value.plan, access.value.resolved, now);
  await supabase.from("google_calendar_connections").update({ sync_issues: issues.list.slice(0, 20) }).eq("user_id", profile.id);
  return { status: "ok", changed: issues.changed };
}

async function applyPlan(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, userId: string, jobs: SyncJob[], plan: SyncPlan, resolved: { pending: PendingCheck; resolution: MissingResolution }[], now: Date) {
  const jobName = new Map(jobs.map((job) => [job.id, job.name]));
  const list: SyncIssue[] = [...plan.issues];
  const nowIso = now.toISOString();
  let changed = 0;
  const report = (jobId: string, startsAt: string, endsAt: string, message: string) => list.push({ jobName: jobName.get(jobId) ?? "Shift", startsAt, endsAt, reason: reasonFor(message) });
  // Every write re-checks in SQL what the plan assumed: this user's shift,
  // linked (or, for an adoption, not yet linked), and -- for anything that
  // moves or removes it -- not started.
  for (const { pending, resolution } of resolved) {
    if (resolution.action === "delete") {
      const { data } = await supabase.from("shifts").delete().eq("id", pending.shiftId).eq("user_id", userId).not("google_event_id", "is", null).eq("google_adopted", false).gt("starts_at", nowIso).select("id");
      changed += data?.length ?? 0;
    } else if (resolution.action === "detach") {
      const { data } = await supabase.from("shifts").update(UNLINK).eq("id", pending.shiftId).eq("user_id", userId).not("google_event_id", "is", null).select("id");
      changed += data?.length ?? 0;
    } else if (resolution.action === "update") {
      const { data, error } = await supabase.from("shifts").update({ job_id: resolution.jobId, starts_at: resolution.startsAt, ends_at: resolution.endsAt }).eq("id", pending.shiftId).eq("user_id", userId).not("google_event_id", "is", null).gt("starts_at", nowIso).select("id");
      if (error) report(resolution.jobId, resolution.startsAt, resolution.endsAt, error.message);
      else changed += data?.length ?? 0;
    }
  }
  for (const item of plan.update) {
    const { data, error } = await supabase.from("shifts").update({ job_id: item.jobId, starts_at: item.startsAt, ends_at: item.endsAt }).eq("id", item.shiftId).eq("user_id", userId).not("google_event_id", "is", null).gt("starts_at", nowIso).select("id");
    if (error) report(item.jobId, item.startsAt, item.endsAt, error.message);
    else changed += data?.length ?? 0;
  }
  for (const item of plan.relink) {
    const { data, error } = await supabase.from("shifts").update({ google_calendar_id: item.calendarId, google_event_id: item.eventId, starts_at: item.startsAt, ends_at: item.endsAt }).eq("id", item.shiftId).eq("user_id", userId).not("google_event_id", "is", null).gt("starts_at", nowIso).select("id");
    if (error) report(item.jobId, item.startsAt, item.endsAt, error.message);
    else changed += data?.length ?? 0;
  }
  for (const item of plan.adopt) {
    const { data, error } = await supabase.from("shifts").update({ google_calendar_id: item.calendarId, google_event_id: item.eventId, google_adopted: true }).eq("id", item.shiftId).eq("user_id", userId).is("google_event_id", null).select("id");
    if (error || !data?.length) list.push({ jobName: jobName.get(item.jobId) ?? "Shift", startsAt: item.startsAt, endsAt: item.endsAt, reason: "couldn't be linked to its Google event" });
    else changed += 1;
  }
  for (const item of plan.create) {
    const { error } = await supabase.from("shifts").insert({ user_id: userId, job_id: item.jobId, starts_at: item.startsAt, ends_at: item.endsAt, google_calendar_id: item.calendarId, google_event_id: item.eventId });
    if (error) report(item.jobId, item.startsAt, item.endsAt, error.message);
    else changed += 1;
  }
  return { list, changed };
}

/** The last sync's refused shifts, for the Calendar page. */
export async function getSyncIssues(userId: string): Promise<SyncIssue[]> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.from("google_calendar_connections").select("sync_issues").eq("user_id", userId).maybeSingle();
  const issues = Array.isArray(data?.sync_issues) ? data.sync_issues : [];
  return issues.filter((issue): issue is SyncIssue => typeof issue === "object" && issue !== null && typeof (issue as SyncIssue).reason === "string" && typeof (issue as SyncIssue).startsAt === "string");
}

/** Whether any active job syncs, so pages only start a sync that can do something. */
export async function hasSyncingJob(userId: string) {
  const supabase = await createServerSupabaseClient();
  const { count } = await supabase.from("jobs").select("id", { count: "exact", head: true }).eq("user_id", userId).eq("google_sync", true).is("archived_at", null);
  return (count ?? 0) > 0;
}
