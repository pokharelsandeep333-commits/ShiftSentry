"use client";

import { useActionState, useMemo, useState } from "react";
import { createShift, updateShift, type ShiftActionState } from "@/app/actions/work";
import { Button } from "@/components/ui/button";
import { DateTimePicker, type ShiftDateTimeParts } from "@/components/shifts/date-time-picker";
import { PremiumSelect } from "@/components/ui/premium-select";
import { combineShiftDateAndTime, parseShiftDateTimeInput, synchronizedEndDate } from "@/lib/shift-date-time";

type ShiftField = "startsAt" | "endsAt";

export type ShiftFormJob = {
  id: string;
  name: string;
  color: string;
  archived?: boolean;
};

type ShiftFormProps = {
  mode: "create" | "edit";
  jobs: ShiftFormJob[];
  initialShift?: {
    id: string;
    jobId: string;
    startsAt: string;
    endsAt: string;
    notes: string | null;
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

export function ShiftForm({ mode, jobs, initialShift }: ShiftFormProps) {
  const initialStart = partsFromValue(initialShift?.startsAt);
  const initialEnd = partsFromValue(initialShift?.endsAt);
  const [startsAt, setStartsAt] = useState(initialStart);
  const [endsAt, setEndsAt] = useState(initialEnd);
  const [endDateFollowsStart, setEndDateFollowsStart] = useState(() => !initialEnd.date || initialStart.date === initialEnd.date);
  const [submissionProblem, setSubmissionProblem] = useState<FormProblem | null>(null);
  const [dismissedState, setDismissedState] = useState<ShiftActionState | null>(null);
  const action = mode === "create" ? createShift : updateShift;
  const [state, formAction, pending] = useActionState(action, emptyShiftActionState);
  const dismissServerMessage = dismissedState === state;

  const intervalProblem = useMemo(() => {
    const startValue = combineShiftDateAndTime(startsAt.date, startsAt.time);
    const endValue = combineShiftDateAndTime(endsAt.date, endsAt.time);
    return startValue && endValue && endValue <= startValue ? { field: "endsAt" as const, message: "End time must be after start time." } : null;
  }, [endsAt.date, endsAt.time, startsAt.date, startsAt.time]);
  const activeProblem = intervalProblem ?? submissionProblem;

  function markEdited() {
    setSubmissionProblem(null);
    setDismissedState(state);
  }

  function updateStart(next: ShiftDateTimeParts, dateChanged: boolean) {
    markEdited();
    setStartsAt(next);
    if (dateChanged) {
      const syncedEndDate = synchronizedEndDate(next.date, endDateFollowsStart);
      if (syncedEndDate) setEndsAt((current) => ({ ...current, date: syncedEndDate }));
    }
  }

  function updateEnd(next: ShiftDateTimeParts, dateChanged: boolean) {
    markEdited();
    setEndsAt(next);
    if (dateChanged) setEndDateFollowsStart(false);
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
    {mode === "edit" && <input type="hidden" name="id" value={initialShift?.id} />}
    <div className="field-label"><span id="job-label">Job</span><PremiumSelect name="jobId" defaultValue={initialShift?.jobId ?? jobs[0]?.id ?? ""} options={jobs.map((job) => ({ value: job.id, label: job.archived ? `${job.name} (archived)` : job.name }))} labelledBy="job-label" required /></div>
    <div className="grid gap-5 lg:grid-cols-2">
      <DateTimePicker label="Start" name="startsAt" value={startsAt} onChange={updateStart} error={startError} />
      <DateTimePicker label="End" name="endsAt" value={endsAt} onChange={updateEnd} error={endError} />
    </div>
    {generalMessage && <p role="alert" className="rounded-xl border border-[color-mix(in_srgb,var(--danger)_35%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2.5 text-sm font-medium text-[var(--danger)]">{generalMessage}</p>}
    <label className="field-label"><span>Notes</span><textarea name="notes" defaultValue={initialShift?.notes ?? ""} maxLength={500} onInput={markEdited} className="field-textarea text-sm" placeholder="Optional notes" /></label>
    <div><Button type="submit" disabled={pending}>{pending ? "Saving…" : mode === "create" ? "Save shift" : "Save changes"}</Button></div>
  </form>;
}
