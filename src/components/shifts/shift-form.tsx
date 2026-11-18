"use client";

import { useActionState, useMemo, useState, type CSSProperties } from "react";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { History, NotebookPen } from "lucide-react";
import { createShift, updateShift, type ShiftActionState } from "@/app/actions/work";
import Link from "next/link";
import { Button, PendingLabel, buttonVariants } from "@/components/ui/button";
import { CalendarClashNotice } from "@/components/shifts/calendar-clash-notice";
import { DayTrack } from "@/components/shifts/day-track";
import { LimitCheckNotice, isNearLimit, useLimitCheck, type LimitCheck } from "@/components/shifts/limit-check-notice";
import { ShiftScheduleFields, type ShiftDateTimeParts, type ShiftSchedule } from "@/components/shifts/date-time-picker";
import { calculateEarnings, formatCents, type DeductionSnapshot, type PaySnapshot } from "@/lib/earnings";
import { combineShiftDateAndTime, parseShiftDateTimeInput } from "@/lib/shift-date-time";
import { addLocalDays, minuteOf, scheduleOf, selectionOf, weekStartDate, type Selection } from "@/lib/day-track";
import { formatMinutes } from "@/lib/utils";

type ShiftField = "startsAt" | "endsAt";

export type ShiftFormJob = {
  id: string;
  name: string;
  color: string;
  archived?: boolean;
  hourlyRateCents: number;
  taxRateBasisPoints: number;
  deductions: DeductionSnapshot[];
};

type ShiftFormProps = {
  mode: "create" | "edit";
  jobs: ShiftFormJob[];
  /** The viewer's IANA zone, so the preview measures the same span the action will store. */
  timeZone: string;
  initialShift?: {
    /** Present when editing; a duplicate prefills every field but the id. */
    id?: string;
    jobId: string;
    startsAt: string;
    endsAt: string;
    notes: string | null;
    /** What this shift was actually worked at. Absent when duplicating into a new shift. */
    paySnapshot?: PaySnapshot;
  };
  /** True when the viewer has a Google Calendar connected: check the span for clashes. */
  calendarCheck?: boolean;
  /** The local start and end ("HH:mm") of each job's most recent shift, for "Same as last time". */
  lastTimes?: Record<string, LastTimes>;
  /** The profile's week-start day (0 = Sunday), so the day tiles show the weeks the caps count. */
  weekStartsOn: number;
};

export type LastTimes = { start: string; end: string };

type FormProblem = { field: ShiftField | null; message: string };
const emptyShiftActionState: ShiftActionState = { message: "", field: null };

function partsFromValue(value: string | undefined): ShiftDateTimeParts {
  const parsed = value ? parseShiftDateTimeInput(value) : null;
  return parsed ? { date: parsed.date, time: parsed.time } : { date: "", time: "" };
}

function clientProblem(form: HTMLFormElement): FormProblem | null {
  const start = parseShiftDateTimeInput(String(new FormData(form).get("startsAt") ?? ""));
  if (!start) return { field: "startsAt", message: "Enter a valid start date and time." };
  const end = parseShiftDateTimeInput(String(new FormData(form).get("endsAt") ?? ""));
  if (!end) return { field: "endsAt", message: "Enter a valid end date and time." };
  if (end.value <= start.value) return { field: "endsAt", message: "End time must be after start time." };
  return null;
}

function fieldMessage(problem: FormProblem | null, state: ShiftActionState, dismissServerMessage: boolean, field: ShiftField) {
  if (problem?.field === field) return problem.message;
  if (!dismissServerMessage && state.field === field) return state.message;
  return undefined;
}


/**
 * Minutes between the two pickers, measured through the viewer's zone so an
 * overnight shift across a DST boundary previews the same span the server
 * stores. Returns null until both halves parse into a forward interval.
 */
/** "14:30" as "2:30 PM". */
function clockLabel(time: string) {
  const [hours, minutes] = time.split(":").map(Number);
  return `${hours % 12 || 12}:${String(minutes).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
}

/** The local date after a "yyyy-MM-dd" one, at UTC noon like the rest of the date arithmetic. */
function nextDate(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + 1, 12)).toISOString().slice(0, 10);
}

function previewMinutes(startsAt: ShiftDateTimeParts, endsAt: ShiftDateTimeParts, timeZone: string) {
  const start = combineShiftDateAndTime(startsAt.date, startsAt.time);
  const end = combineShiftDateAndTime(endsAt.date, endsAt.time);
  if (!start || !end) return null;
  const minutes = Math.floor((fromZonedTime(end, timeZone).getTime() - fromZonedTime(start, timeZone).getTime()) / 60_000);
  return minutes > 0 ? minutes : null;
}

export function ShiftForm({ mode, jobs, timeZone, initialShift, calendarCheck = false, lastTimes = {}, weekStartsOn }: ShiftFormProps) {
  // A new, blank shift starts on today: the track needs a day to draw.
  const initialStart = initialShift ? partsFromValue(initialShift.startsAt) : { date: formatInTimeZone(new Date(), timeZone, "yyyy-MM-dd"), time: "" };
  const initialEnd = partsFromValue(initialShift?.endsAt);
  // Read once at render: the compiler cannot verify a memo whose dependency is
  // reached through an optional chain.
  const storedSnapshot = initialShift?.paySnapshot;
  const storedJobId = initialShift?.jobId;
  const [startsAt, setStartsAt] = useState(initialStart);
  const [endsAt, setEndsAt] = useState(initialEnd);
  const [jobId, setJobId] = useState(initialShift?.jobId ?? jobs[0]?.id ?? "");
  const [repeatWeeks, setRepeatWeeks] = useState(1);
  const [submissionProblem, setSubmissionProblem] = useState<FormProblem | null>(null);
  const [dismissedState, setDismissedState] = useState<ShiftActionState | null>(null);
  const action = mode === "create" ? createShift : updateShift;
  const [state, formAction, pending] = useActionState(action, emptyShiftActionState);
  const dismissServerMessage = dismissedState === state;

  // The end date is freely pickable, so the 24-hour ceiling the action and the
  // `enforce_shift_weekly_limits` trigger both enforce is now reachable here.
  const intervalProblem = useMemo(() => {
    const startValue = combineShiftDateAndTime(startsAt.date, startsAt.time);
    const endValue = combineShiftDateAndTime(endsAt.date, endsAt.time);
    if (!startValue || !endValue) return null;
    if (endValue <= startValue) return { field: "endsAt" as const, message: "End time must be after start time." };
    const minutes = (fromZonedTime(endValue, timeZone).getTime() - fromZonedTime(startValue, timeZone).getTime()) / 60_000;
    return minutes > 24 * 60 ? { field: "endsAt" as const, message: "A shift cannot be longer than 24 hours." } : null;
  }, [endsAt.date, endsAt.time, startsAt.date, startsAt.time, timeZone]);
  const activeProblem = intervalProblem ?? submissionProblem;

  // The same span the server will store, as UTC instants, for the calendar check.
  const span = useMemo(() => {
    const start = combineShiftDateAndTime(startsAt.date, startsAt.time);
    const end = combineShiftDateAndTime(endsAt.date, endsAt.time);
    if (!start || !end || intervalProblem) return null;
    return { startsAt: fromZonedTime(start, timeZone).toISOString(), endsAt: fromZonedTime(end, timeZone).toISOString() };
  }, [endsAt.date, endsAt.time, intervalProblem, startsAt.date, startsAt.time, timeZone]);

  // The picker's wall-clock times, which the limit check turns into repeats the way createShift does.
  const localSpan = span ? { start: combineShiftDateAndTime(startsAt.date, startsAt.time), end: combineShiftDateAndTime(endsAt.date, endsAt.time) } : null;

  const preview = useMemo(() => {
    const minutes = previewMinutes(startsAt, endsAt, timeZone);
    const job = jobs.find((candidate) => candidate.id === jobId);
    if (minutes === null || !job) return null;
    // An existing shift keeps the rate it was worked at, so quoting the job's
    // current rate here would preview a figure the server is not going to save.
    // Moving the shift to another job is the case that does re-read the job.
    const snapshot = storedSnapshot && jobId === storedJobId
      ? storedSnapshot
      : { hourlyRateCents: job.hourlyRateCents, taxRateBasisPoints: job.taxRateBasisPoints, deductions: job.deductions };
    const pay = calculateEarnings(minutes, snapshot);
    return { minutes, pay };
  }, [endsAt, jobId, jobs, startsAt, storedJobId, storedSnapshot, timeZone]);

  function markEdited() {
    setSubmissionProblem(null);
    setDismissedState(state);
  }

  function updateSchedule(next: ShiftSchedule) {
    markEdited();
    setStartsAt(next.startsAt);
    setEndsAt(next.endsAt);
  }

  // "Same as last time": the job's usual hours on the date already picked, or
  // today. An end at or before the start is the next morning, as on a night shift.
  const last = mode === "create" ? lastTimes[jobId] : undefined;
  const lastApplied = last && startsAt.time === last.start && endsAt.time === last.end;
  function applyLastTimes() {
    if (!last) return;
    const date = startsAt.date || formatInTimeZone(new Date(), timeZone, "yyyy-MM-dd");
    updateSchedule({ startsAt: { date, time: last.start }, endsAt: { date: last.end <= last.start ? nextDate(date) : date, time: last.end } });
  }

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    const problem = clientProblem(event.currentTarget);
    if (!problem) return;
    event.preventDefault();
    setSubmissionProblem(problem);
    setDismissedState(state);
  }

  const generalMessage = !dismissServerMessage && state.message && !state.field ? state.message : "";
  const startError = fieldMessage(activeProblem, state, dismissServerMessage, "startsAt");
  const endError = fieldMessage(activeProblem, state, dismissServerMessage, "endsAt");

  const selectedJob = jobs.find((job) => job.id === jobId);
  const selection = selectionOf(startsAt, endsAt);
  // A tap places the job's usual length; a last shift under an hour was likely
  // a correction, not a pattern, so it falls back to two hours.
  const lastLength = last ? lengthOf(last) : null;
  const defaultLength = lastLength && lastLength >= 60 ? lastLength : selection ? selection.end - selection.start : 120;
  const check = useLimitCheck({ start: localSpan?.start ?? null, end: localSpan?.end ?? null, jobId, repeatWeeks, excludeId: initialShift?.id });

  // A tile keeps the times and moves the whole shift, overnight end included.
  function pickDate(date: string) {
    if (selection) return updateSchedule(scheduleOf(date, selection));
    const endDate = !endsAt.time ? "" : startsAt.time && endsAt.time <= startsAt.time ? addLocalDays(date, 1) : date;
    updateSchedule({ startsAt: { date, time: startsAt.time }, endsAt: { date: endDate, time: endsAt.time } });
  }

  function moveOnTrack(next: Selection) {
    if (!startsAt.date) return;
    updateSchedule(scheduleOf(startsAt.date, next));
  }

  return <form action={formAction} onSubmit={handleSubmit} onInput={markEdited} className="shift-form shift-composer">
    {mode === "edit" && <input type="hidden" name="id" value={initialShift?.id ?? ""} />}
    <fieldset className="composer-section">
      <legend className="composer-label">Job</legend>
      <div className="job-chips">
        {jobs.map((job) => <label key={job.id} className="job-chip" style={jobColor(job.color)}>
          <input type="radio" name="jobId" value={job.id} checked={jobId === job.id} onChange={() => { markEdited(); setJobId(job.id); }} required className="sr-only" />
          <i aria-hidden="true" /><span>{job.name}{job.archived && <span className="job-chip-note"> · archived</span>}</span>
        </label>)}
      </div>
    </fieldset>

    <section className="composer-section" aria-labelledby="shift-when">
      <div className="composer-head">
        <h2 id="shift-when" className="composer-label">When</h2>
        {last && !lastApplied && <button type="button" className="shift-last-time" onClick={applyLastTimes}><History aria-hidden="true" /><span>Same as last time</span><span className="shift-last-time-value">{clockLabel(last.start)} – {clockLabel(last.end)}</span></button>}
      </div>
      <DayTrack date={startsAt.date} selection={selection} timeZone={timeZone} weekStartsOn={weekStartsOn} excludeId={initialShift?.id} jobName={selectedJob?.name ?? "Shift"} jobColor={selectedJob?.color ?? "#98a2b3"} defaultLength={defaultLength} onPickDate={pickDate} onChange={moveOnTrack} />
      <div className="composer-exact">
        <ShiftScheduleFields startsAt={startsAt} endsAt={endsAt} timeZone={timeZone} onChange={updateSchedule} startError={startError} endError={endError} />
      </div>
    </section>

    {mode === "create" && <fieldset className="composer-section">
      <legend className="composer-label">Repeat weekly</legend>
      <div className="repeat-segment">
        {REPEAT_WEEKS.map((weeks) => <label key={weeks}>
          <input type="radio" name="repeatWeeks" value={weeks} checked={repeatWeeks === weeks} onChange={() => setRepeatWeeks(weeks)} aria-label={weeks === 1 ? "Just this shift" : `Repeat for ${weeks} weeks`} className="sr-only" />
          <span aria-hidden="true">{weeks === 1 ? "Once" : `${weeks} wks`}</span>
        </label>)}
      </div>
    </fieldset>}

    <details className="composer-section composer-note" open={Boolean(initialShift?.notes) || undefined}>
      <summary><NotebookPen aria-hidden="true" /><span>Note</span><span className="composer-note-hint">Who you covered, a different room…</span></summary>
      <label htmlFor="shift-notes" className="sr-only">Note</label>
      <textarea id="shift-notes" name="notes" defaultValue={initialShift?.notes ?? ""} maxLength={500} onInput={markEdited} rows={2} placeholder="Anything to remember about this shift" />
    </details>

    <div className="composer-checks shift-form-notices">
      {generalMessage && <p role="alert" className="shift-check shift-check-bad">{generalMessage}</p>}
      <LimitCheckNotice check={check} jobId={jobId} timeZone={timeZone} />
      {calendarCheck && <CalendarClashNotice startsAt={span?.startsAt ?? null} endsAt={span?.endsAt ?? null} jobId={jobId} timeZone={timeZone} repeatWeeks={repeatWeeks} />}
    </div>

    <div className="composer-footer">
      <ShiftSum preview={preview} repeatWeeks={repeatWeeks} check={check} timeZone={timeZone} weekStartsOn={weekStartsOn} />
      <div className="composer-actions"><Link href="/shifts" className={buttonVariants({ variant: "outline" })}>Cancel</Link><Button type="submit" className="shift-button save-shift" disabled={pending}><PendingLabel pending={pending} label={mode === "create" ? "Save shift" : "Save changes"} pendingLabel="Saving…" /></Button></div>
    </div>
  </form>;
}

const REPEAT_WEEKS = [1, 2, 4, 6, 8, 12];

function jobColor(color: string | undefined): CSSProperties {
  return { "--job": color ?? "#98a2b3" } as CSSProperties;
}

/** A remembered start and end as a length, an end at or before the start being the next morning. */
function lengthOf(times: LastTimes) {
  const start = minuteOf(times.start);
  const end = minuteOf(times.end);
  if (start === null || end === null) return null;
  return end > start ? end - start : end + 24 * 60 - start;
}

/**
 * What Save would mean, beside the button: net pay as the figure, gross and
 * the deductions as its working, and the week's hours with this shift in. The
 * week line comes from the same limit check as the notices above; a shift
 * that would be refused leaves it to them.
 */
function ShiftSum({ preview, repeatWeeks, check, timeZone, weekStartsOn }: { preview: { minutes: number; pay: ReturnType<typeof calculateEarnings> } | null; repeatWeeks: number; check: LimitCheck | null; timeZone: string; weekStartsOn: number }) {
  const first = check?.occurrences[0];
  const week = first?.fits ? first.weeks[0] : undefined;
  const thisWeek = weekStartDate(formatInTimeZone(new Date(), timeZone, "yyyy-MM-dd"), weekStartsOn);
  const weekName = week ? formatInTimeZone(week.weekStart, timeZone, "yyyy-MM-dd") === thisWeek ? "This week" : `Week of ${formatInTimeZone(week.weekStart, timeZone, "MMM d")}` : "";
  return <div className="composer-sum" aria-live="polite">
    <p className="sum-net" data-empty={!preview || undefined}><strong>{preview ? formatCents(preview.pay.netCents) : "–"}</strong><span>net{preview && repeatWeeks > 1 ? " each" : ""}</span></p>
    <p className="sum-detail">{preview
      ? <>{formatMinutes(preview.minutes)} · {formatCents(preview.pay.grossCents)} gross − {formatCents(preview.pay.taxCents + preview.pay.deductionCents)} tax and deductions</>
      : "Pick the times to see what it pays"}</p>
    {preview && repeatWeeks > 1 && <p className="sum-detail">Over {repeatWeeks} weeks: <b>{formatCents(preview.pay.netCents * repeatWeeks)}</b> net, {formatMinutes(preview.minutes * repeatWeeks)}, if every week is saved</p>}
    {check && week && <p className="sum-week" data-near={isNearLimit(check, week) || undefined}>
      <span>{weekName} with it</span>
      <span><b>{formatMinutes(week.globalAfter)}</b>{week.globalLimit !== null && ` of ${formatMinutes(week.globalLimit)}`}</span>
      {check.jobLimit !== null && <span>{check.jobName} <b>{formatMinutes(week.jobAfter)}</b> of {formatMinutes(check.jobLimit)}</span>}
    </p>}
  </div>;
}
