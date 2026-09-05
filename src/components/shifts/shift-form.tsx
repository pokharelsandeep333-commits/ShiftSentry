"use client";

import { useActionState, useMemo, useState } from "react";
import { fromZonedTime } from "date-fns-tz";
import { createShift, updateShift, type ShiftActionState } from "@/app/actions/work";
import { Button } from "@/components/ui/button";
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
};

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
function previewMinutes(startsAt: ShiftDateTimeParts, endsAt: ShiftDateTimeParts, timeZone: string) {
  const start = combineShiftDateAndTime(startsAt.date, startsAt.time);
  const end = combineShiftDateAndTime(endsAt.date, endsAt.time);
  if (!start || !end) return null;
  const minutes = Math.floor((fromZonedTime(end, timeZone).getTime() - fromZonedTime(start, timeZone).getTime()) / 60_000);
  return minutes > 0 ? minutes : null;
}

function PreviewFigure({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return <div><dt className="text-xs font-medium text-[var(--muted-foreground)]">{label}</dt><dd className={accent ? "mt-1 font-display text-lg font-semibold text-[var(--success)]" : "mt-1 font-display text-lg font-semibold"}>{value}</dd></div>;
}

export function ShiftForm({ mode, jobs, timeZone, initialShift }: ShiftFormProps) {
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

  return <form action={formAction} onSubmit={handleSubmit} onInput={markEdited} className="grid gap-5">
    {mode === "edit" && <input type="hidden" name="id" value={initialShift?.id ?? ""} />}
    <div className="field-label"><span id="job-label">Job</span><PremiumSelect name="jobId" defaultValue={jobId} options={jobs.map((job) => ({ value: job.id, label: job.archived ? `${job.name} (archived)` : job.name }))} labelledBy="job-label" onValueChange={(value) => { markEdited(); setJobId(value); }} required /></div>
    <ShiftScheduleFields startsAt={startsAt} endsAt={endsAt} timeZone={timeZone} onChange={updateSchedule} startError={startError} endError={endError} />
    {preview && <dl className="grid grid-cols-2 gap-4 rounded-2xl border bg-[var(--surface-subtle)] p-4 sm:grid-cols-4">
      <PreviewFigure label="Duration" value={formatMinutes(preview.minutes)} />
      <PreviewFigure label="Gross" value={formatCents(preview.pay.grossCents)} />
      <PreviewFigure label="Tax + deductions" value={`−${formatCents(preview.pay.taxCents + preview.pay.deductionCents)}`} />
      <PreviewFigure label="Net" value={formatCents(preview.pay.netCents)} accent />
    </dl>}
    {preview && repeatWeeks > 1 && <p className="-mt-2 text-sm text-[var(--muted-foreground)]">{repeatWeeks} shifts · {formatMinutes(preview.minutes * repeatWeeks)} · {formatCents(preview.pay.netCents * repeatWeeks)} net, if every week fits your caps.</p>}
    {mode === "create" && <div className="field-label"><span id="repeat-label">Repeat</span><PremiumSelect name="repeatWeeks" defaultValue="1" options={REPEAT_OPTIONS} labelledBy="repeat-label" onValueChange={(value) => setRepeatWeeks(Number(value))} /></div>}
    {generalMessage && <p role="alert" className="rounded-xl border border-[color-mix(in_srgb,var(--danger)_35%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2.5 text-sm font-medium text-[var(--danger)]">{generalMessage}</p>}
    <label className="field-label"><span>Notes</span><textarea name="notes" defaultValue={initialShift?.notes ?? ""} maxLength={500} onInput={markEdited} className="field-textarea text-sm" placeholder="Optional notes" /></label>
    <div><Button type="submit" disabled={pending}>{pending ? "Saving…" : mode === "create" ? "Save shift" : "Save changes"}</Button></div>
  </form>;
}
