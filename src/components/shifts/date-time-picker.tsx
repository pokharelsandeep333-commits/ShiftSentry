"use client";

import { useMemo, useState } from "react";
import { fromZonedTime, toZonedTime } from "date-fns-tz";
import { DateField, formatDateLabel, shiftCalendarDays } from "@/components/shifts/date-field";
import { TimeField } from "@/components/shifts/time-field";
import { formatDurationMinutes, parseDurationToMinutes } from "@/components/shifts/time-parsing";
import { combineShiftDateAndTime } from "@/lib/shift-date-time";

export type ShiftDateTimeParts = { date: string; time: string };
export type ShiftSchedule = { startsAt: ShiftDateTimeParts; endsAt: ShiftDateTimeParts };

type ShiftScheduleFieldsProps = {
  startsAt: ShiftDateTimeParts;
  endsAt: ShiftDateTimeParts;
  /** The viewer's IANA zone, so the duration matches what the action stores. */
  timeZone: string;
  onChange: (next: ShiftSchedule) => void;
  startError?: string;
  endError?: string;
};

const MAX_SHIFT_MINUTES = 24 * 60;

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function partsInZone(instant: Date, timeZone: string): ShiftDateTimeParts {
  const zoned = toZonedTime(instant, timeZone);
  return {
    date: `${zoned.getFullYear()}-${pad(zoned.getMonth() + 1)}-${pad(zoned.getDate())}`,
    time: `${pad(zoned.getHours())}:${pad(zoned.getMinutes())}`,
  };
}

function instantOf(parts: ShiftDateTimeParts, timeZone: string) {
  const value = combineShiftDateAndTime(parts.date, parts.time);
  return value ? fromZonedTime(value, timeZone) : null;
}

/**
 * The end date while the user has not set one themselves. It mirrors the start
 * date as soon as there is one, so picking a start fills the end in too. Once
 * both clock times are known a shift may not span more than 24 hours, so an end
 * at or before the start clock can only mean the next calendar day — which
 * keeps an overnight shift a two-field edit.
 */
function autoEndParts(startsAt: ShiftDateTimeParts, endTime: string): ShiftDateTimeParts {
  if (!startsAt.date) return { date: "", time: endTime };
  if (!endTime || !startsAt.time) return { date: startsAt.date, time: endTime };
  return { date: endTime > startsAt.time ? startsAt.date : shiftCalendarDays(startsAt.date, 1), time: endTime };
}

function FieldLabel({ htmlFor, children }: { htmlFor: string; children: React.ReactNode }) {
  return <label className="field-label text-xs" htmlFor={htmlFor}><span>{children}</span></label>;
}

export function ShiftScheduleFields({ startsAt, endsAt, timeZone, onChange, startError, endError }: ShiftScheduleFieldsProps) {
  const [startEntryError, setStartEntryError] = useState("");
  const [endEntryError, setEndEntryError] = useState("");
  const [durationDraft, setDurationDraft] = useState<string | null>(null);
  // Until the user picks an end date, it trails the start — including rolling
  // over midnight on its own. Once they pick one, it stays exactly where it is.
  const [endDateTouched, setEndDateTouched] = useState(false);

  const now = useMemo(() => partsInZone(new Date(), timeZone), [timeZone]);

  const durationMinutes = useMemo(() => {
    const start = instantOf(startsAt, timeZone);
    const end = instantOf(endsAt, timeZone);
    if (!start || !end) return null;
    const minutes = Math.round((end.getTime() - start.getTime()) / 60_000);
    return minutes > 0 ? minutes : null;
  }, [endsAt, startsAt, timeZone]);

  const durationDisplay = durationDraft ?? (durationMinutes === null ? "" : formatDurationMinutes(durationMinutes));
  const startProblem = startEntryError || startError;
  const endProblem = endEntryError || endError;
  const followsStart = !endDateTouched || !endsAt.date;

  function endPartsFor(nextStart: ShiftDateTimeParts, endTime: string): ShiftDateTimeParts {
    if (followsStart) return autoEndParts(nextStart, endTime);
    return { date: endsAt.date, time: endTime };
  }

  function applyStart(next: ShiftDateTimeParts) {
    setDurationDraft(null);
    onChange({ startsAt: next, endsAt: endPartsFor(next, endsAt.time) });
  }

  function applyEndTime(time: string) {
    setDurationDraft(null);
    onChange({ startsAt, endsAt: endPartsFor(startsAt, time) });
  }

  function applyEndDate(date: string) {
    setDurationDraft(null);
    setEndDateTouched(true);
    onChange({ startsAt, endsAt: { ...endsAt, date } });
  }

  function handleStartTime(time: string | null) {
    if (time === null) {
      setStartEntryError("Enter a time such as 5:30 PM, 530pm, or 17:30.");
      return;
    }
    setStartEntryError("");
    applyStart({ ...startsAt, time });
  }

  function handleEndTime(time: string | null) {
    if (time === null) {
      setEndEntryError("Enter a time such as 5:30 PM, 530pm, or 17:30.");
      return;
    }
    setEndEntryError("");
    applyEndTime(time);
  }

  function commitDuration() {
    if (durationDraft === null) return;
    const trimmed = durationDraft.trim();
    if (!trimmed) {
      setDurationDraft(null);
      return;
    }

    const minutes = parseDurationToMinutes(trimmed);
    if (minutes === null || minutes <= 0 || minutes > MAX_SHIFT_MINUTES) {
      setEndEntryError("Enter a length between 1 minute and 24h, such as 8h 30m.");
      return;
    }

    const start = instantOf(startsAt, timeZone);
    if (!start) {
      setEndEntryError("Choose the start date and time first.");
      return;
    }

    setEndEntryError("");
    setDurationDraft(null);
    onChange({ startsAt, endsAt: partsInZone(new Date(start.getTime() + minutes * 60_000), timeZone) });
  }

  // Whole calendar days between the two dates, so the badge stays honest once
  // the user picks an end date of their own rather than letting it follow.
  const dayOffset = useMemo(() => {
    if (!startsAt.date || !endsAt.date) return 0;
    return Math.round((Date.parse(`${endsAt.date}T00:00:00Z`) - Date.parse(`${startsAt.date}T00:00:00Z`)) / 86_400_000);
  }, [endsAt.date, startsAt.date]);
  const offsetLabel = dayOffset === 1 ? "Next day" : dayOffset ? `${dayOffset > 0 ? "+" : "−"}${Math.abs(dayOffset)} days` : "";

  return <div className="shift-schedule-fields">
    <input type="hidden" name="startsAt" value={combineShiftDateAndTime(startsAt.date, startsAt.time)} />
    <input type="hidden" name="endsAt" value={combineShiftDateAndTime(endsAt.date, endsAt.time)} />
    <fieldset className="min-w-0"><legend className="sr-only">Start</legend><div className="shift-schedule-row">
      <div><FieldLabel htmlFor="startsAt-date">Start date</FieldLabel><DateField id="startsAt-date" value={startsAt.date} onChange={(date) => applyStart({ ...startsAt, date })} today={now.date} ariaLabel="Start date" describedBy={startProblem ? "startsAt-help" : undefined} invalid={Boolean(startProblem)} compactLabel /></div>
      <div><FieldLabel htmlFor="startsAt-time">Start time</FieldLabel><TimeField id="startsAt-time" value={startsAt.time} onChange={handleStartTime} fallback={now.time} ariaLabel="Start time" describedBy={startProblem ? "startsAt-help" : undefined} invalid={Boolean(startProblem)} /></div>
    </div>{startProblem && <p id="startsAt-help" role="alert" className="mt-3 text-sm font-medium text-[var(--danger)]">{startProblem}</p>}</fieldset>
    <fieldset className="min-w-0"><legend className="sr-only">End</legend><div className="shift-schedule-row">
      <div><FieldLabel htmlFor="endsAt-date">End date</FieldLabel><DateField id="endsAt-date" value={endsAt.date} onChange={applyEndDate} today={now.date} ariaLabel="End date" describedBy={endProblem ? "endsAt-help" : undefined} invalid={Boolean(endProblem)} compactLabel /></div>
      <div><FieldLabel htmlFor="endsAt-time">End time</FieldLabel><TimeField id="endsAt-time" value={endsAt.time} onChange={handleEndTime} fallback={startsAt.time || now.time} ariaLabel="End time" describedBy={endProblem ? "endsAt-help" : undefined} invalid={Boolean(endProblem)} /></div>
    </div>
    {offsetLabel && <p className="shift-date-meta"><span className="font-semibold text-[var(--primary)]">{offsetLabel}</span> · {followsStart ? "Follows the start date" : formatDateLabel(endsAt.date)}</p>}
    <details className="shift-duration-shortcut"><summary>Set duration instead</summary><label htmlFor="endsAt-duration" className="sr-only">Length</label><input id="endsAt-duration" value={durationDisplay} placeholder="8h 30m" autoComplete="off" inputMode="text" aria-invalid={Boolean(endProblem) || undefined} aria-describedby={endProblem ? "endsAt-help" : undefined} className="field-control text-sm" onChange={(event) => setDurationDraft(event.target.value)} onBlur={commitDuration} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commitDuration(); } }} /></details>
    {endProblem && <p id="endsAt-help" role="alert" className="mt-2 text-sm font-medium text-[var(--danger)]">{endProblem}</p>}
    </fieldset>
  </div>;
}
