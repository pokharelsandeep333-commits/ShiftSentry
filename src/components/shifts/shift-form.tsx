"use client";

import { useActionState, useMemo, useState } from "react";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { History } from "lucide-react";
import { createShift, updateShift, type ShiftActionState } from "@/app/actions/work";
import Link from "next/link";
import { Button, PendingLabel, buttonVariants } from "@/components/ui/button";
import { CalendarClashNotice } from "@/components/shifts/calendar-clash-notice";
import { LimitCheckNotice } from "@/components/shifts/limit-check-notice";
import { ShiftScheduleFields, type ShiftDateTimeParts, type ShiftSchedule } from "@/components/shifts/date-time-picker";
import { PremiumSelect } from "@/components/ui/premium-select";
import { calculateEarnings, formatCents, type DeductionSnapshot, type PaySnapshot } from "@/lib/earnings";
import { combineShiftDateAndTime, parseShiftDateTimeInput } from "@/lib/shift-date-time";
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

const REPEAT_OPTIONS = [
  { value: "1", label: "Just this shift" },
  { value: "2", label: "Repeat weekly × 2" },
  { value: "4", label: "Repeat weekly × 4" },
  { value: "6", label: "Repeat weekly × 6" },
  { value: "8", label: "Repeat weekly × 8" },
  { value: "12", label: "Repeat weekly × 12" },
];

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

export function ShiftForm({ mode, jobs, timeZone, initialShift, calendarCheck = false, lastTimes = {} }: ShiftFormProps) {
  const initialStart = partsFromValue(initialShift?.startsAt);
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
  return <form action={formAction} onSubmit={handleSubmit} onInput={markEdited} className="shift-form">
    {mode === "edit" && <input type="hidden" name="id" value={initialShift?.id ?? ""} />}
    <div className="shift-form-fields">
      <div className="shift-job-field"><label id="job-label">Job</label><div className="shift-job-select"><PremiumSelect name="jobId" defaultValue={jobId} options={jobs.map((job) => ({ value: job.id, label: job.archived ? `${job.name} (archived)` : job.name }))} labelledBy="job-label" onValueChange={(value) => { markEdited(); setJobId(value); }} required /><span className="shift-job-dot" style={{ backgroundColor: selectedJob?.color }} aria-hidden="true" /></div></div>
      <div className="shift-times">
        {last && !lastApplied && <button type="button" className="shift-last-time" onClick={applyLastTimes}><History aria-hidden="true" /><span>Same as last time</span><span className="shift-last-time-value">{clockLabel(last.start)} – {clockLabel(last.end)}</span></button>}
        <ShiftScheduleFields startsAt={startsAt} endsAt={endsAt} timeZone={timeZone} onChange={updateSchedule} startError={startError} endError={endError} />
        {mode === "create" && <div><label id="repeat-label">Repeat</label><PremiumSelect name="repeatWeeks" defaultValue="1" options={REPEAT_OPTIONS} labelledBy="repeat-label" onValueChange={(value) => setRepeatWeeks(Number(value))} /></div>}
        {/* What Save would meet, beside the times that decide it. */}
        <div className="shift-form-notices">
          <LimitCheckNotice start={localSpan?.start ?? null} end={localSpan?.end ?? null} jobId={jobId} repeatWeeks={repeatWeeks} excludeId={initialShift?.id} timeZone={timeZone} />
          {calendarCheck && <CalendarClashNotice startsAt={span?.startsAt ?? null} endsAt={span?.endsAt ?? null} jobId={jobId} timeZone={timeZone} repeatWeeks={repeatWeeks} />}
        </div>
      </div>
      <div className="shift-pay-preview" aria-live="polite"><h2>Pay preview</h2><dl>
        <div><dt>Duration</dt><dd>{preview ? formatMinutes(preview.minutes) : "—"}</dd></div>
        <div><dt>Gross</dt><dd>{preview ? formatCents(preview.pay.grossCents) : "—"}</dd></div>
        <div><dt>Tax + deductions</dt><dd>{preview ? `−${formatCents(preview.pay.taxCents + preview.pay.deductionCents)}` : "—"}</dd></div>
        <div className="receipt-net"><dt>Net</dt><dd>{preview ? formatCents(preview.pay.netCents) : "—"}</dd></div>
      </dl>
      {preview && repeatWeeks > 1 && <p className="mt-2 text-xs text-[var(--muted-foreground)]">Each week. {repeatWeeks} weeks would be {formatMinutes(preview.minutes * repeatWeeks)} and {formatCents(preview.pay.netCents * repeatWeeks)} net if all of them are saved.</p>}
      </div>
      <div><label htmlFor="shift-notes">Notes</label><textarea id="shift-notes" name="notes" defaultValue={initialShift?.notes ?? ""} maxLength={500} onInput={markEdited} rows={2} placeholder="Optional notes" /></div>
      {generalMessage && <p role="alert" className="rounded-xl border border-[color-mix(in_srgb,var(--danger)_35%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2.5 text-sm font-medium text-[var(--danger)]">{generalMessage}</p>}
    </div>
    <div className="shift-editor-footer"><Link href="/shifts" className={buttonVariants({ variant: "outline" })}>Cancel</Link><Button type="submit" className="shift-button save-shift" disabled={pending}><PendingLabel pending={pending} label={mode === "create" ? "Save shift" : "Save changes"} pendingLabel="Saving…" /></Button></div>
  </form>;
}
