import Link from "next/link";
import { BriefcaseBusiness, CalendarPlus, ChevronDown, NotebookPen, RefreshCw } from "lucide-react";
import { addDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { SavedToast } from "@/components/saved-toast";
import { ShiftRowActions } from "@/components/shifts/shift-row-actions";
import { ShiftLogHeader, SyncIssuesNotice } from "@/components/shifts/shift-log-header";
import { WeekLimits } from "@/components/shifts/week-limits";
import { seriesIdOf, type SyncIssue } from "@/lib/google-sync-plan";
import { WeekDisclosure } from "@/components/shifts/week-disclosure";
import { WeekNote } from "@/components/shifts/week-note";
import { getWeekLimits } from "@/lib/dashboard";
import { formatCents } from "@/lib/earnings";
import { addWeeksToLocalDateTime } from "@/lib/shift-date-time";
import { weekStartFor } from "@/lib/time";
import { WEEKS_PER_PAGE, clampWeeks, isFiltered, readShiftFilters, shiftLogHref, type ShiftFilters } from "@/lib/shift-log";
import { formatMinutes } from "@/lib/utils";
import { GoogleSyncTrigger } from "@/components/google-sync-trigger";
import { LoadError } from "@/components/load-error";
import { isGoogleCalendarEnabled } from "@/lib/google/config";
import { getSyncIssues, hasSyncingJob } from "@/lib/google/shift-sync";
import { noteForWeek, weekStartOfLocalDate, type WeekNote as WeekNoteRow } from "@/lib/week-notes";
import type { JobLimitRow, WeekMeter } from "@/lib/week-meter";

type JobRef = { name: string; color: string; archived_at: string | null };

export type ShiftRow = {
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

export type WeekGroup = { key: string; start: Date; shifts: ShiftRow[]; minutes: number; netCents: number };

/**
 * Group by the week a shift *starts* in, honouring the profile's `week_starts_on`.
 * An overnight shift crossing the boundary counts wholly to its starting week --
 * unlike the dashboard, which splits minutes across days, this list exists to
 * find a shift again, and one appearing under two weeks would be worse than one
 * appearing slightly early.
 *
 * Weeks with no shifts are listed too when they can carry a note: the current
 * week (so a note can be written before anything is logged) and any week that
 * already has one, so a note never disappears with the week's last shift. A
 * filtered view passes no extra weeks: it shows only where its shifts are.
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

/**
 * The shift log's data: the loaded weeks (filtered by `?show=` and `?job=`),
 * whether older ones exist, the week notes, the active jobs for the filter
 * chips, this week's limits, and Google sync's refusals. The drawing is
 * `ShiftLogView`, so it can be checked without a session.
 */
export async function ShiftLog({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const profile = await requireUser();
  const params = await searchParams;
  const saved = savedMessage(params);
  const weeks = clampWeeks(single(params.weeks));
  const filters = readShiftFilters((name) => params[name]);
  const filtered = isFiltered(filters);
  const syncing = isGoogleCalendarEnabled() && await hasSyncingJob(profile.id);

  const now = new Date();
  const currentWeekStart = weekStartFor(now, profile.time_zone, profile.week_starts_on);
  const windowStart = addDays(currentWeekStart, -7 * (weeks - 1));

  const supabase = await createServerSupabaseClient();
  // No upper bound: scheduled future shifts always belong on this page. The
  // second query only asks whether anything older exists, so "Load older weeks"
  // never appears when it would do nothing. Both take the same filters.
  let shiftsQuery = supabase.from("shifts").select("id,job_id,starts_at,ends_at,notes,net_cents,google_event_id,jobs(name,color,archived_at)").eq("user_id", profile.id).gte("starts_at", windowStart.toISOString());
  let olderQuery = supabase.from("shifts").select("id", { count: "exact", head: true }).eq("user_id", profile.id).lt("starts_at", windowStart.toISOString());
  if (filters.job) { shiftsQuery = shiftsQuery.eq("job_id", filters.job); olderQuery = olderQuery.eq("job_id", filters.job); }
  if (filters.show === "upcoming") { shiftsQuery = shiftsQuery.gt("starts_at", now.toISOString()); olderQuery = olderQuery.gt("starts_at", now.toISOString()); }
  if (filters.show === "worked") { shiftsQuery = shiftsQuery.lte("starts_at", now.toISOString()); olderQuery = olderQuery.lte("starts_at", now.toISOString()); }

  const windowStartDate = formatInTimeZone(windowStart, profile.time_zone, "yyyy-MM-dd");
  const [{ data: shifts, error: shiftsError }, { count: olderCount }, { data: noteRows, error: notesError }, { data: jobs }, limits, issues] = await Promise.all([
    shiftsQuery.order("starts_at", { ascending: false }),
    olderQuery,
    supabase.from("week_notes").select("id,week_start,body").eq("user_id", profile.id).gte("week_start", windowStartDate),
    supabase.from("jobs").select("id,name,color").eq("user_id", profile.id).is("archived_at", null).order("name"),
    getWeekLimits(profile),
    syncing ? getSyncIssues(profile.id) : Promise.resolve([] as SyncIssue[]),
  ]);

  if (shiftsError) return <><PageHeader title="Shifts" description="Everything you have worked or scheduled, week by week." /><LoadError what="shifts" /></>;

  // Notes are an addition to the log, not part of it: if they cannot be read
  // the log still renders, without them.
  const notes: WeekNoteRow[] | null = notesError ? null : noteRows ?? [];
  const noteWeeks = (notes ?? []).map((note) => weekStartOfLocalDate(note.week_start, profile.time_zone, profile.week_starts_on));
  const rows = (shifts ?? []) as ShiftRow[];
  const groups = groupByWeek(rows, profile.time_zone, profile.week_starts_on, filtered ? [] : [currentWeekStart, ...noteWeeks]);

  return <ShiftLogView
    groups={groups}
    currentKey={currentWeekStart.toISOString()}
    timeZone={profile.time_zone}
    weeks={weeks}
    filters={filters}
    notes={notes}
    jobs={jobs ?? []}
    olderCount={olderCount ?? 0}
    hasAnyShifts={rows.length > 0 || Boolean(olderCount)}
    saved={saved}
    syncing={syncing}
    issues={issues}
    limits={limits}
  />;
}

type ShiftLogViewProps = {
  groups: WeekGroup[];
  currentKey: string;
  timeZone: string;
  weeks: number;
  filters: ShiftFilters;
  notes: WeekNoteRow[] | null;
  jobs: { id: string; name: string; color: string }[];
  olderCount: number;
  hasAnyShifts: boolean;
  saved?: string;
  syncing?: boolean;
  issues: SyncIssue[];
  limits: { meter: WeekMeter; jobs: JobLimitRow[] } | null;
};

export function ShiftLogView({ groups, currentKey, timeZone, weeks, filters, notes, jobs, olderCount, hasAnyShifts, saved, syncing, issues, limits }: ShiftLogViewProps) {
  const filtered = isFiltered(filters);
  const firstRun = !jobs.length && !hasAnyShifts;

  return <div className="shift-log">
    {syncing && <GoogleSyncTrigger />}
    {saved && <SavedToast message={saved} clearParams={["created", "skipped", "saved"]} />}
    <ShiftLogHeader weeks={weeks} filters={filters} jobs={jobs} openableWeeks={groups.map((group) => ({ key: group.key, defaultOpen: group.key === currentKey }))} />
    <SyncIssuesNotice issues={issues} timeZone={timeZone} />

    {firstRun ? <Card className="grid justify-items-center gap-4 px-6 py-12 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-[var(--primary-soft)] text-[var(--primary)]"><BriefcaseBusiness className="size-6" aria-hidden="true" /></span>
      <div>
        <h2 className="font-display text-xl font-semibold">Add a job, then your first shift</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--muted-foreground)]">Every shift belongs to a job, which holds its pay rate and weekly limit. Once you have one, your shifts show up here week by week.</p>
      </div>
      <Link href="/jobs/new" className={buttonVariants()}>Add a job</Link>
    </Card>
      : filtered && !groups.length ? <Card className="px-6 py-10 text-center">
        <p className="text-sm text-[var(--muted-foreground)]">No shifts match these filters{olderCount ? " in the weeks loaded" : ""}.</p>
        <Link href={shiftLogHref(weeks, { show: "all", job: "" })} className="mt-3 inline-block text-sm font-semibold text-[var(--primary)] underline-offset-4 hover:underline">Clear filters</Link>
      </Card>
      : <div className="shift-weeks">{groups.map((group) => <ShiftWeek key={group.key} group={group} current={group.key === currentKey} timeZone={timeZone} weeks={weeks} filters={filters} notes={notes} limits={group.key === currentKey ? limits : null} canAdd={jobs.length > 0} />)}</div>}

    {olderCount ? <div className="older-wrap"><Link href={shiftLogHref(clampWeeks(weeks + WEEKS_PER_PAGE), filters)} scroll={false} className="shift-text-button">Load older weeks <span>({olderCount} older)</span><ChevronDown size={16} aria-hidden="true" /></Link></div> : null}
  </div>;
}

export function ShiftWeek({ group, current, timeZone, weeks, filters, notes, limits, canAdd }: { group: WeekGroup; current: boolean; timeZone: string; weeks: number; filters: ShiftFilters; notes: WeekNoteRow[] | null; limits: { meter: WeekMeter; jobs: JobLimitRow[] } | null; canAdd: boolean }) {
  const lastDay = addDays(group.start, 6);
  const range = `${formatInTimeZone(group.start, timeZone, "MMM d")} – ${formatInTimeZone(lastDay, timeZone, "MMM d")}`;
  const weekStart = formatInTimeZone(group.start, timeZone, "yyyy-MM-dd");
  const note = notes ? noteForWeek(notes, weekStart) : null;
  const count = group.shifts.length;
  return <WeekDisclosure weekKey={group.key} defaultOpen={current} current={current}
    summary={<>
      <span className="week-title"><strong>{current ? "This week" : range}</strong><span>{current ? range : `${count} shift${count === 1 ? "" : "s"}`}</span></span>
      {note && <span className="shrink-0 text-[var(--primary)] group-open:hidden" title="Has a note"><NotebookPen aria-hidden="true" size={16} /><span className="sr-only">Has a note</span></span>}
      <span className="week-totals"><span className="week-duration">{formatMinutes(group.minutes)}<small>total</small></span><span className="week-net">{formatCents(group.netCents)}<small>net estimate</small></span></span>
    </>}
  >
    {current && limits && !filters.job && <div className="week-note-wrap"><WeekLimits meter={limits.meter} jobs={limits.jobs} /></div>}
    {notes && <div className="week-note-wrap"><WeekNote weekStart={weekStart} label={`the week of ${range}`} note={note} /></div>}
    <div className="shift-table" role="table" aria-label={`Shifts for ${range}`}>
      <div className="shift-table-head" role="row"><span role="columnheader">Date</span><span role="columnheader">Job</span><span role="columnheader">Time</span><span role="columnheader">Duration</span><span role="columnheader">Status</span><span className="sr-only" role="columnheader">Actions</span></div>
      {count ? [...group.shifts].sort((a, b) => a.starts_at.localeCompare(b.starts_at)).map((shift) => <ShiftListRow key={shift.id} shift={shift} timeZone={timeZone} weeks={weeks} filters={filters} />)
        : <div className="shift-empty flex flex-wrap items-center justify-center gap-3">
          <span>{current ? "No shifts this week yet." : "No shifts this week."}</span>
          {current && canAdd && <Link href="/shifts/new" className={buttonVariants({ variant: "outline", size: "sm" })}><CalendarPlus className="size-4" aria-hidden="true" />Add a shift</Link>}
        </div>}
    </div>
  </WeekDisclosure>;
}

/**
 * One shift. The whole row opens it: the job name is a link whose hit area is
 * stretched over the row (`.shift-row-link::after` in shifts.css), which keeps
 * the actions menu a separate, real button rather than a button inside a link.
 */
function ShiftListRow({ shift, timeZone, weeks, filters }: { shift: ShiftRow; timeZone: string; weeks: number; filters: ShiftFilters }) {
  const job = Array.isArray(shift.jobs) ? shift.jobs[0] : shift.jobs;
  const future = new Date(shift.starts_at) > new Date();
  const overnight = formatInTimeZone(shift.starts_at, timeZone, "yyyy-MM-dd") !== formatInTimeZone(shift.ends_at, timeZone, "yyyy-MM-dd");
  const date = formatInTimeZone(shift.starts_at, timeZone, "EEE, MMM d");
  const time = `${formatInTimeZone(shift.starts_at, timeZone, "h:mm a")} – ${formatInTimeZone(shift.ends_at, timeZone, "h:mm a")}`;
  return <div className="shift-row" role="row">
    <div className="row-date" role="cell">{date}</div>
    <div className="row-job" role="cell">
      <i aria-hidden="true" style={{ backgroundColor: job?.color ?? "#98a2b3" }} />
      <span>
        <Link href={`/shifts/${shift.id}/edit`} className="shift-row-link" aria-label={`Open ${job?.name ?? "shift"}, ${date}, ${time}`}>{job?.name ?? "Archived job"}</Link>
        {shift.google_event_id && <span className="shift-google-chip"><RefreshCw aria-hidden="true" size={11} />From Google</span>}
      </span>
    </div>
    <div className="row-time" role="cell">{time}{overnight && <small>Ends {formatInTimeZone(shift.ends_at, timeZone, "EEE, MMM d")}</small>}{shift.notes && <small className="row-note"><NotebookPen aria-hidden="true" size={12} /><span className="line-clamp-2">{shift.notes}</span></small>}</div>
    <div className="row-duration" role="cell">{formatMinutes(shiftMinutes(shift))}</div>
    <div className="row-status" role="cell"><span className={`status-chip ${future ? "scheduled" : ""}`}>{future ? "Upcoming" : "Worked"}</span></div>
    <div className="row-actions" role="cell"><ShiftRowActions shiftId={shift.id} editHref={`/shifts/${shift.id}/edit`} duplicateHref={job && !job.archived_at ? duplicateHref(shift, timeZone) : undefined} weeks={weeks} filters={filters} repeating={Boolean(shift.google_event_id && seriesIdOf({ id: shift.google_event_id }))} /></div>
  </div>;
}
