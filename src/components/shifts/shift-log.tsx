import Link from "next/link";
import { ChevronDown, NotebookPen } from "lucide-react";
import { addDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { PageHeader } from "@/components/page-header";
import { requireUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { SavedToast } from "@/components/saved-toast";
import { ShiftRowActions } from "@/components/shifts/shift-row-actions";
import { seriesIdOf } from "@/lib/google-sync-plan";
import { WeekDisclosure } from "@/components/shifts/week-disclosure";
import { WeekNote } from "@/components/shifts/week-note";
import { formatCents } from "@/lib/earnings";
import { addWeeksToLocalDateTime } from "@/lib/shift-date-time";
import { weekStartFor } from "@/lib/time";
import { WEEKS_PER_PAGE, clampWeeks } from "@/lib/shift-log";
import { formatMinutes } from "@/lib/utils";
import { GoogleSyncTrigger } from "@/components/google-sync-trigger";
import { LoadError } from "@/components/load-error";
import { isGoogleCalendarEnabled } from "@/lib/google/config";
import { hasSyncingJob } from "@/lib/google/shift-sync";
import { noteForWeek, weekStartOfLocalDate, type WeekNote as WeekNoteRow } from "@/lib/week-notes";

type JobRef = { name: string; color: string; archived_at: string | null };

type ShiftRow = {
  id: string;
  job_id: string;
  google_event_id: string | null;
  starts_at: string;
  ends_at: string;
  notes: string | null;
  net_cents: number | null;
  jobs: JobRef | JobRef[] | null;
};

type SearchParams = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function nextWeekLocal(value: string, timeZone: string) {
  return addWeeksToLocalDateTime(formatInTimeZone(value, timeZone, "yyyy-MM-dd'T'HH:mm"), 1);
}

/** Reports what a weekly repeat actually managed to create. */
function createdMessage(created: number, skipped: number) {
  if (!created) return "";
  const added = created === 1 ? "Shift added" : `${created} shifts added`;
  if (!skipped) return added;
  return `${added}. ${skipped} skipped — they clash with an existing shift or a weekly cap.`;
}

/** What a mutation that redirected back here should confirm. */
function savedMessage(params: SearchParams) {
  if (single(params.saved) === "shift-deleted") return "Shift deleted";
  if (single(params.saved) === "series-stopped") return "Repeating event removed. Google sync won’t add it again.";
  if (single(params.saved) === "shift-notes") return "Notes saved";
  return createdMessage(Number(params.created ?? 0), Number(params.skipped ?? 0));
}

function duplicateHref(shift: ShiftRow, timeZone: string) {
  const params = new URLSearchParams({ jobId: shift.job_id, startsAt: nextWeekLocal(shift.starts_at, timeZone), endsAt: nextWeekLocal(shift.ends_at, timeZone) });
  if (shift.notes) params.set("notes", shift.notes);
  return `/shifts/new?${params.toString()}`;
}

function shiftMinutes(shift: ShiftRow) {
  return Math.round((new Date(shift.ends_at).getTime() - new Date(shift.starts_at).getTime()) / 60000);
}

type WeekGroup = { key: string; start: Date; shifts: ShiftRow[]; minutes: number; netCents: number };

/**
 * Group by the week a shift *starts* in, honouring the profile's `week_starts_on`.
 * An overnight shift crossing the boundary counts wholly to its starting week --
 * unlike the dashboard, which splits minutes across days, this list exists to
 * find a shift again, and one appearing under two weeks would be worse than one
 * appearing slightly early.
 *
 * Weeks with no shifts are listed too when they can carry a note: the current
 * week (so a note can be written before anything is logged) and any week that
 * already has one, so a note never disappears with the week's last shift.
 */
function groupByWeek(shifts: ShiftRow[], timeZone: string, weekStartsOn: number, extraWeeks: Date[]) {
  const groups = new Map<string, WeekGroup>();

  for (const shift of shifts) {
    const start = weekStartFor(new Date(shift.starts_at), timeZone, weekStartsOn);
    const key = start.toISOString();
    const group = groups.get(key) ?? { key, start, shifts: [], minutes: 0, netCents: 0 };
    group.shifts.push(shift);
    group.minutes += shiftMinutes(shift);
    group.netCents += shift.net_cents ?? 0;
    groups.set(key, group);
  }

  for (const start of extraWeeks) {
    const key = start.toISOString();
    if (!groups.has(key)) groups.set(key, { key, start, shifts: [], minutes: 0, netCents: 0 });
  }

  return [...groups.values()].sort((a, b) => b.start.getTime() - a.start.getTime());
}

export async function ShiftLog({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const profile = await requireUser();
  const params = await searchParams;
  const saved = savedMessage(params);
  const weeks = clampWeeks(single(params.weeks));
  const syncing = isGoogleCalendarEnabled() && await hasSyncingJob(profile.id);

  const currentWeekStart = weekStartFor(new Date(), profile.time_zone, profile.week_starts_on);
  const windowStart = addDays(currentWeekStart, -7 * (weeks - 1));

  const supabase = await createServerSupabaseClient();
  // No upper bound: scheduled future shifts always belong on this page. The
  // second query only asks whether anything older exists, so "Load older weeks"
  // never appears when it would do nothing.
  const windowStartDate = formatInTimeZone(windowStart, profile.time_zone, "yyyy-MM-dd");
  const [{ data: shifts, error: shiftsError }, { count: olderCount }, { data: weeksBefore }, { data: noteRows, error: notesError }] = await Promise.all([
    supabase.from("shifts").select("id,job_id,starts_at,ends_at,notes,net_cents,google_event_id,jobs(name,color,archived_at)").eq("user_id", profile.id).gte("starts_at", windowStart.toISOString()).order("starts_at", { ascending: false }),
    supabase.from("shifts").select("id", { count: "exact", head: true }).eq("user_id", profile.id).lt("starts_at", windowStart.toISOString()),
    supabase.rpc("shift_week_count_before", { p_time_zone: profile.time_zone, p_week_starts_on: profile.week_starts_on, p_before: windowStart.toISOString() }),
    supabase.from("week_notes").select("id,week_start,body").eq("user_id", profile.id).gte("week_start", windowStartDate),
  ]);

  // Notes are an addition to the log, not part of it: if they cannot be read
  // (the migration not yet applied, say) the log still renders, without them.
  const notes: WeekNoteRow[] | null = notesError ? null : noteRows ?? [];
  const noteWeeks = (notes ?? []).map((note) => weekStartOfLocalDate(note.week_start, profile.time_zone, profile.week_starts_on));
  const groups = groupByWeek((shifts ?? []) as ShiftRow[], profile.time_zone, profile.week_starts_on, [currentWeekStart, ...noteWeeks]);
  const currentKey = currentWeekStart.toISOString();

  // `windowStart` is itself a week start, so no week straddles it: every week
  // before it is counted by the RPC, and every week in `groups` comes after.
  // `groups` is newest-first, so the last one is the oldest week loaded and
  // takes the first number after that count.
  //
  // The `?? 0` also degrades gracefully if the migration adding the function
  // has not been applied yet: the log still renders, numbered from week 1
  // within the window, rather than the page failing outright.
  //
  // Only weeks with shifts are numbered, because the RPC counts only those: a
  // number on an empty week would renumber every later week the moment "Load
  // older weeks" brought more of them into the window.
  const numbers = new Map<string, number>();
  let next = (weeksBefore ?? 0) + 1;
  for (const group of [...groups].reverse()) if (group.shifts.length) numbers.set(group.key, next++);

  if (shiftsError) return <><PageHeader title="All shifts" description="Grouped by your week. Future entries are included in projected cap warnings." /><LoadError what="shifts" /></>;

  return <div className="shift-log">
    {syncing && <GoogleSyncTrigger />}
    {saved && <SavedToast message={saved} clearParams={["created", "skipped", "saved"]} />}
    <div className="shift-page-heading"><div><h1>All shifts</h1><p>Grouped by your week.</p></div></div>
    <div className="shift-weeks">{groups.map((group) => <ShiftWeek key={group.key} group={group} number={numbers.get(group.key) ?? null} current={group.key === currentKey} timeZone={profile.time_zone} weeks={weeks} notes={notes} />)}</div>
    {olderCount ? <div className="older-wrap"><Link href={`/shifts?weeks=${clampWeeks(weeks + WEEKS_PER_PAGE)}`} className="shift-text-button">Load older weeks <span>({olderCount} older)</span><ChevronDown size={16} aria-hidden="true" /></Link></div> : null}
  </div>;
}

export function ShiftWeek({ group, number, current, timeZone, weeks, notes }: { group: WeekGroup; number: number | null; current: boolean; timeZone: string; weeks: number; notes: WeekNoteRow[] | null }) {
  const lastDay = addDays(group.start, 6);
  const range = `${formatInTimeZone(group.start, timeZone, "MMM d")} – ${formatInTimeZone(lastDay, timeZone, "MMM d")}`;
  const weekStart = formatInTimeZone(group.start, timeZone, "yyyy-MM-dd");
  const note = notes ? noteForWeek(notes, weekStart) : null;
  return <WeekDisclosure weekKey={group.key} defaultOpen={current} current={current}
    summary={<>
      <span className="week-title"><strong>{current ? "This week" : range}</strong>{current ? <span>{range}{number ? <span className="sr-only"> · Week {number}</span> : null}</span> : number ? <span className="week-number">Week {number}</span> : null}</span>
      {note && <span className="shrink-0 text-[var(--primary)] group-open:hidden" title="Has a note"><NotebookPen aria-hidden="true" size={16} /><span className="sr-only">Has a note</span></span>}
      <span className="week-totals"><span className="week-duration">{formatMinutes(group.minutes)}<small>total</small></span><span className="week-net">{formatCents(group.netCents)}<small>net estimate</small></span></span>
    </>}
  >
    {notes && <div className="week-note-wrap"><WeekNote weekStart={weekStart} label={`the week of ${range}`} note={note} /></div>}
    <div className="shift-table" role="table" aria-label={`Shifts for ${range}`}>
      <div className="shift-table-head" role="row"><span role="columnheader">Date</span><span role="columnheader">Job</span><span role="columnheader">Time</span><span role="columnheader">Duration</span><span role="columnheader">Status</span><span className="sr-only" role="columnheader">Actions</span></div>
      {group.shifts.length ? [...group.shifts].sort((a, b) => a.starts_at.localeCompare(b.starts_at)).map((shift) => <ShiftListRow key={shift.id} shift={shift} timeZone={timeZone} weeks={weeks} />) : <p className="shift-empty">{current ? "No shifts this week yet." : "No shifts this week."}</p>}
    </div>
  </WeekDisclosure>;
}

function ShiftListRow({ shift, timeZone, weeks }: { shift: ShiftRow; timeZone: string; weeks: number }) {
  const job = Array.isArray(shift.jobs) ? shift.jobs[0] : shift.jobs;
  const future = new Date(shift.starts_at) > new Date();
  const overnight = formatInTimeZone(shift.starts_at, timeZone, "yyyy-MM-dd") !== formatInTimeZone(shift.ends_at, timeZone, "yyyy-MM-dd");
  return <div className="shift-row" role="row">
    <div className="row-date" role="cell">{formatInTimeZone(shift.starts_at, timeZone, "EEE d")}</div>
    <div className="row-job" role="cell"><i aria-hidden="true" style={{ backgroundColor: job?.color ?? "#98a2b3" }} /><span>{job?.name ?? "Archived job"}{shift.google_event_id && <small className="block text-[10px] text-[var(--muted-foreground)]">From Google Calendar</small>}</span></div>
    <div className="row-time" role="cell">{formatInTimeZone(shift.starts_at, timeZone, "h:mm a")} – {formatInTimeZone(shift.ends_at, timeZone, "h:mm a")}{overnight && <small>Ends {formatInTimeZone(shift.ends_at, timeZone, "EEE, MMM d")}</small>}{shift.notes && <small className="line-clamp-2">{shift.notes}</small>}</div>
    <div className="row-duration" role="cell">{formatMinutes(shiftMinutes(shift))}</div>
    <div className="row-status" role="cell"><span className={`status-chip ${future ? "scheduled" : ""}`}>{future ? "Scheduled" : "Logged"}</span></div>
    <div className="row-actions" role="cell"><ShiftRowActions shiftId={shift.id} editHref={`/shifts/${shift.id}/edit`} duplicateHref={job && !job.archived_at ? duplicateHref(shift, timeZone) : undefined} weeks={weeks} repeating={Boolean(shift.google_event_id && seriesIdOf({ id: shift.google_event_id }))} /></div>
  </div>;
}
