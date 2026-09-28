import { planShiftSync, type LinkedShift, type SyncIssue, type SyncJob } from "@/lib/google-sync-plan";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listEventsForSync } from "./client";
import { isGoogleCalendarEnabled } from "./config";
import { withCalendarAccess, type CalendarAccess } from "./connection";

/**
 * One sync run for one user: load the jobs that sync and their shifts in the
 * window, read Google, plan (google-sync-plan.ts), then apply the plan one
 * shift at a time through the RLS client, so the 24-hour limit, weekly caps,
 * overlaps and the pay snapshot are enforced by the same triggers as any shift.
 * A write the database refuses becomes an issue for the Calendar page.
 *
 * Runs after a page renders (the sync route), throttled per user through
 * `shifts_synced_at`, which is stamped before the Google call so two tabs do
 * not both run it.
 */
const WINDOW_BACK_MS = 14 * 24 * 60 * 60_000;
const WINDOW_AHEAD_MS = 56 * 24 * 60 * 60_000;
const THROTTLE_MS = 5 * 60_000;
const FORCE_THROTTLE_MS = 30_000;

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
  const { data: connection } = await supabase.from("google_calendar_connections").select("status,shifts_synced_at,selected_calendar_ids").eq("user_id", profile.id).maybeSingle();
  if (!connection) return { status: "not_connected", changed: 0 };
  if (connection.status === "needs_reconnect") return { status: "needs_reconnect", changed: 0 };
  const last = connection.shifts_synced_at ? Date.parse(connection.shifts_synced_at) : 0;
  if (Date.now() - last < (force ? FORCE_THROTTLE_MS : THROTTLE_MS)) return { status: "skipped", changed: 0 };
  await supabase.from("google_calendar_connections").update({ shifts_synced_at: new Date().toISOString() }).eq("user_id", profile.id);

  const { data: jobRows } = await supabase.from("jobs").select("id,name,google_keyword,google_calendar_id,google_sync,google_sync_ignored").eq("user_id", profile.id).is("archived_at", null);
  const jobs: SyncJob[] = (jobRows ?? []).map((job) => ({ id: job.id, name: job.name, keyword: job.google_keyword, calendarId: job.google_calendar_id, sync: job.google_sync, ignored: job.google_sync_ignored }));
  const syncJobs = jobs.filter((job) => job.sync);
  if (syncJobs.length === 0) {
    await supabase.from("google_calendar_connections").update({ sync_issues: [] }).eq("user_id", profile.id);
    return { status: "ok", changed: 0 };
  }

  const now = new Date();
  const range = { timeMin: new Date(now.getTime() - WINDOW_BACK_MS).toISOString(), timeMax: new Date(now.getTime() + WINDOW_AHEAD_MS).toISOString() };
  const { data: shiftRows, error: shiftError } = await supabase.from("shifts").select("id,job_id,starts_at,ends_at,google_calendar_id,google_event_id").eq("user_id", profile.id).in("job_id", syncJobs.map((job) => job.id)).gt("ends_at", range.timeMin).lt("starts_at", range.timeMax);
  if (shiftError) return { status: "unavailable", changed: 0 };
  const shifts: LinkedShift[] = (shiftRows ?? []).map((row) => ({ id: row.id, jobId: row.job_id, startsAt: row.starts_at, endsAt: row.ends_at, calendarId: row.google_calendar_id, eventId: row.google_event_id }));

  const selected = connection.selected_calendar_ids;
  const calendarIds = [...new Set([...selected, ...syncJobs.flatMap((job) => (job.calendarId ? [job.calendarId] : []))])];
  const access = await withCalendarAccess(profile.id, (token) => listEventsForSync(token, calendarIds, range, profile.time_zone));
  if (access.status !== "ok") return { status: access.status, changed: 0 };

  const plan = planShiftSync({ events: access.value.events, jobs, shifts, selectedCalendarIds: selected, failedCalendarIds: access.value.failedCalendarIds, now });
  const jobName = new Map(jobs.map((job) => [job.id, job.name]));
  const issues: SyncIssue[] = [...plan.issues];
  let changed = 0;

  for (const item of plan.create) {
    const { error } = await supabase.from("shifts").insert({ user_id: profile.id, job_id: item.jobId, starts_at: item.startsAt, ends_at: item.endsAt, google_calendar_id: item.calendarId, google_event_id: item.eventId });
    if (error) issues.push({ jobName: jobName.get(item.jobId) ?? "Shift", startsAt: item.startsAt, endsAt: item.endsAt, reason: reasonFor(error.message) });
    else changed += 1;
  }
  for (const item of plan.adopt) {
    const { error } = await supabase.from("shifts").update({ google_calendar_id: item.calendarId, google_event_id: item.eventId }).eq("id", item.shiftId).is("google_event_id", null);
    if (!error) changed += 1;
  }
  for (const item of plan.update) {
    const { error } = await supabase.from("shifts").update({ job_id: item.jobId, starts_at: item.startsAt, ends_at: item.endsAt }).eq("id", item.shiftId).not("google_event_id", "is", null);
    if (error) issues.push({ jobName: jobName.get(item.jobId) ?? "Shift", startsAt: item.startsAt, endsAt: item.endsAt, reason: reasonFor(error.message) });
    else changed += 1;
  }
  if (plan.remove.length > 0) {
    // Guarded again here: only linked shifts that have not started are removed.
    const { data: removed } = await supabase.from("shifts").delete().in("id", plan.remove).not("google_event_id", "is", null).gt("starts_at", now.toISOString()).select("id");
    changed += removed?.length ?? 0;
  }

  await supabase.from("google_calendar_connections").update({ sync_issues: issues.slice(0, 20) }).eq("user_id", profile.id);
  return { status: "ok", changed };
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
