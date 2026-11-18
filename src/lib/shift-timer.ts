import { formatInTimeZone } from "date-fns-tz";
import { allocateWeekMinutes } from "@/lib/week-meter";
import { weekEndFor, weekStartFor } from "@/lib/time";

/**
 * Clock in / clock out. A running timer is a `shift_timers` row
 * (20261117120000): the job and the instant the database stamped as the start.
 * Stopping turns it into an ordinary shift through `stopShiftTimer`, so every
 * shift rule applies to it exactly as to a typed-in one. Clocking in during a
 * shift already logged for that time adopts it instead (`adoptableShift`), and
 * Stop then updates that shift's times. These helpers are the pure part: what
 * a timer would become if stopped now, which shift it adopts, how the clock
 * reads, what the advisory limit check says, and the week's minutes with the
 * running time folded in.
 */

/** The logged shift a timer adopted: Stop rewrites its start and end to the real ones. */
export type AdoptedShift = { shiftId: string; startsAt: string; endsAt: string };

export type RunningTimer = { jobId: string; jobName: string; jobColor: string; jobArchived: boolean; startedAt: string; adopted: AdoptedShift | null };

const MINUTE_MS = 60_000;
export const MAX_SHIFT_MS = 24 * 60 * MINUTE_MS;
/** Past this a timer was probably forgotten, so the card asks before logging it. */
export const LONG_TIMER_MS = 12 * 60 * MINUTE_MS;

function floorToMinute(date: Date) {
  return new Date(Math.floor(date.getTime() / MINUTE_MS) * MINUTE_MS);
}

export type TimerShift = { startsAt: Date; endsAt: Date; minutes: number; status: "ok" | "too-short" | "too-long" };

/**
 * The shift a timer becomes when stopped at `now`. Both ends are floored to the
 * whole minute: shifts are entered and shown to the minute everywhere else, and
 * flooring both keeps the length honest (a timer run 59.9 minutes logs 59 or
 * 60, never 61). Under a minute is nothing to log; over 24 hours is a shift the
 * database refuses, almost always a timer left running.
 */
export function timerShift(startedAt: Date, now: Date): TimerShift {
  const startsAt = floorToMinute(startedAt);
  const endsAt = floorToMinute(now);
  const span = endsAt.getTime() - startsAt.getTime();
  const minutes = Math.max(0, Math.round(span / MINUTE_MS));
  return { startsAt, endsAt, minutes, status: span < MINUTE_MS ? "too-short" : span > MAX_SHIFT_MS ? "too-long" : "ok" };
}

/** "0:04:09", "12:30:00": hours are not wrapped at a day, so a forgotten timer reads as one. */
export function formatElapsed(ms: number) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return `${hours}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

/** When the timer started, as the viewer reads it: the time alone today, the weekday and time otherwise. */
export function startedLabel(startedAt: Date, now: Date, timeZone: string) {
  const sameDay = formatInTimeZone(startedAt, timeZone, "yyyy-MM-dd") === formatInTimeZone(now, timeZone, "yyyy-MM-dd");
  return formatInTimeZone(startedAt, timeZone, sameDay ? "h:mm a" : "EEE h:mm a");
}

const LOCAL = "yyyy-MM-dd'T'HH:mm";

/**
 * The shift editor, filled in with this timer's job and times, for when
 * stopping now is not the right answer: a timer forgotten overnight, a stop the
 * rules refuse, or an end time that was really earlier. The end is capped at
 * the 24 hours a shift may last, so the form opens on something it can save
 * once the real end is picked. `timer` tells `createShift` which running timer
 * the saved shift replaces, so saving it there stops the clock too.
 */
export function timerEditorHref(timer: Pick<RunningTimer, "jobId" | "startedAt"> & { adopted?: AdoptedShift | null }, now: Date, timeZone: string) {
  const startsAt = floorToMinute(new Date(timer.startedAt));
  const latest = new Date(startsAt.getTime() + MAX_SHIFT_MS);
  const endsAt = floorToMinute(now) < latest ? floorToMinute(now) : latest;
  const params = new URLSearchParams({
    jobId: timer.jobId,
    startsAt: formatInTimeZone(startsAt, timeZone, LOCAL),
    endsAt: formatInTimeZone(endsAt.getTime() > startsAt.getTime() ? endsAt : new Date(startsAt.getTime() + MINUTE_MS), timeZone, LOCAL),
    timer: timer.startedAt,
  });
  // An adopted shift is corrected where it is edited, so saving updates it
  // rather than adding a second shift beside it.
  if (timer.adopted) { params.delete("jobId"); return `/shifts/${encodeURIComponent(timer.adopted.shiftId)}/edit?${params.toString()}`; }
  return `/shifts/new?${params.toString()}`;
}

/** How early a scheduled shift can be clocked into. */
export const ADOPT_EARLY_MINUTES = 30;

export type AdoptionCandidate = { id: string; jobId: string; startsAt: Date; endsAt: Date };

/**
 * The logged shift a clock-in at `now` belongs to, if any.
 *
 * - The shift under way, whatever its job: only one of the viewer's shifts can
 *   cover an instant (shifts never overlap), and a timer beside it could only
 *   end in an overlap. `sameJob` is false when it is not the job chosen; the
 *   action refuses that rather than log hours under a job nobody picked.
 * - Else the earliest shift *of the chosen job* starting within
 *   `ADOPT_EARLY_MINUTES`: clocking in a few minutes early is the common case.
 *   A different job starting soon is left alone, so finishing one job's shift
 *   just before another's still clocks in normally.
 */
export function adoptableShift<S extends AdoptionCandidate>(shifts: S[], jobId: string, now: Date): { shift: S; sameJob: boolean } | null {
  const underway = shifts.find((shift) => shift.startsAt <= now && shift.endsAt > now);
  if (underway) return { shift: underway, sameJob: underway.jobId === jobId };
  const soon = shifts
    .filter((shift) => shift.jobId === jobId && shift.startsAt > now && shift.startsAt.getTime() - now.getTime() <= ADOPT_EARLY_MINUTES * MINUTE_MS)
    .sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime())[0];
  return soon ? { shift: soon, sameJob: true } : null;
}

/**
 * The job the clock-in card starts on: the job of the shift under way, else of
 * the earliest starting within `ADOPT_EARLY_MINUTES`, so Start adopts it with
 * no extra tap. Null when nothing is that close; the card then falls back to
 * the remembered or first job.
 */
export function suggestedClockJob(shifts: AdoptionCandidate[], now: Date): string | null {
  const underway = shifts.find((shift) => shift.startsAt <= now && shift.endsAt > now);
  if (underway) return underway.jobId;
  const soon = shifts
    .filter((shift) => shift.startsAt > now && shift.startsAt.getTime() - now.getTime() <= ADOPT_EARLY_MINUTES * MINUTE_MS)
    .sort((left, right) => left.startsAt.getTime() - right.startsAt.getTime())[0];
  return soon?.jobId ?? null;
}

export type LiveTimer = { jobId: string; startedAt: string; adopted: AdoptedShift | null };

type MeterJob = { id: string; usedMinutes: number; scheduledMinutes: number };

/**
 * The week's per-job minutes with a running timer counted as it ticks, for the
 * header meter and the dashboard's cap card. `jobs` were totalled by the
 * server at `countedAt`, where a started shift counts as logged and a later
 * one as scheduled (`allocateWeekMinutes`); this adds what the timer has run
 * since, the same whole minutes a Stop now would log (`timerShift`), so the
 * meters agree with the limit check.
 *
 * An adopted shift is already in those totals as planned, so it is taken back
 * out exactly as it was counted and replaced by the timer's span as logged plus
 * whatever of the shift is still ahead as scheduled: what the week comes to if
 * the shift runs to its planned end. Nothing is counted twice, and once Stop
 * saves the shift the timer is gone and the server's totals hold it instead.
 *
 * Counts into the week holding `countedAt`, the week the totals describe.
 * `workedDelta` is the change to the clipped-at-now "logged" figure.
 */
export function liveWeekJobs<J extends MeterJob>(jobs: J[], timer: LiveTimer | null, countedAt: Date, now: Date, timeZone: string, weekStartsOn: number): { jobs: J[]; workedDelta: number } {
  if (!timer || !jobs.some((job) => job.id === timer.jobId)) return { jobs, workedDelta: 0 };
  const weekStart = weekStartFor(countedAt, timeZone, weekStartsOn);
  const weekEnd = weekEndFor(countedAt, timeZone, weekStartsOn);
  const inWeek = (from: Date, to: Date) => {
    const start = Math.max(from.getTime(), weekStart.getTime());
    const end = Math.min(to.getTime(), weekEnd.getTime());
    return end > start ? Math.round((end - start) / MINUTE_MS) : 0;
  };
  const one = [{ id: timer.jobId }];
  // Whole minutes, as Stop would log them; the adopted shift's remaining plan
  // starts at the same minute, so the two pieces tile with no minute lost.
  const span = timerShift(new Date(timer.startedAt), now);
  let used = 0;
  let scheduled = 0;
  let workedDelta = 0;

  if (timer.adopted) {
    const shift = { jobId: timer.jobId, startsAt: new Date(timer.adopted.startsAt), endsAt: new Date(timer.adopted.endsAt) };
    const [counted] = allocateWeekMinutes(one, [shift], countedAt, timeZone, weekStartsOn);
    used -= counted.usedMinutes;
    scheduled -= counted.scheduledMinutes;
    if (shift.startsAt < countedAt) workedDelta -= inWeek(shift.startsAt, shift.endsAt < countedAt ? shift.endsAt : countedAt);
    const rest = shift.startsAt > span.endsAt ? shift.startsAt : span.endsAt;
    if (shift.endsAt > rest) scheduled += inWeek(rest, shift.endsAt);
  }

  if (span.status !== "too-short") {
    const [ran] = allocateWeekMinutes(one, [{ jobId: timer.jobId, startsAt: span.startsAt, endsAt: span.endsAt }], countedAt, timeZone, weekStartsOn);
    // Started by `countedAt` (it is running), so all of it counts as logged.
    used += ran.usedMinutes + ran.scheduledMinutes;
    workedDelta += inWeek(span.startsAt, span.endsAt);
  }

  return {
    jobs: jobs.map((job) => job.id === timer.jobId ? { ...job, usedMinutes: Math.max(0, job.usedMinutes + used), scheduledMinutes: Math.max(0, job.scheduledMinutes + scheduled) } : job),
    workedDelta,
  };
}

/**
 * The query the card sends to `GET /shifts/limit-check`, which takes local
 * wall-clock times. An adopted shift is the one being rewritten, so it is left
 * out of the check exactly as the editor leaves out the shift it edits.
 */
export function limitCheckQuery(timer: Pick<RunningTimer, "jobId" | "startedAt"> & { adopted?: Pick<AdoptedShift, "shiftId"> | null }, now: Date, timeZone: string) {
  const shift = timerShift(new Date(timer.startedAt), now);
  if (shift.status !== "ok") return null;
  const params = new URLSearchParams({ job: timer.jobId, start: formatInTimeZone(shift.startsAt, timeZone, LOCAL), end: formatInTimeZone(shift.endsAt, timeZone, LOCAL), repeat: "1" });
  if (timer.adopted) params.set("exclude", timer.adopted.shiftId);
  return params.toString();
}

/** The parts of the limit-check response the timer reads. */
export type LimitCheckReply = {
  status: "ok";
  globalLimit: number | null;
  jobLimit: number | null;
  occurrences: {
    fits: boolean;
    over: "global" | "job" | null;
    badSpan: boolean;
    overlap: { jobName: string; startsAt: string; endsAt: string } | null;
    weeks: { weekStart: string; globalAfter: number; jobAfter: number }[];
  }[];
};

export type TimerOutlook =
  | { kind: "refused"; reason: "global" | "job" | "overlap" | "span"; overlap: { jobName: string; startsAt: string; endsAt: string } | null }
  | { kind: "fits"; limit: "global" | "job" | null; remainingMinutes: number | null; capAt: Date | null };

/**
 * What stopping would meet, read from the limit check for [start, checkedAt).
 *
 * Refused: the check already says the database would turn the shift down.
 * Otherwise, the room left under the tighter of the two limits in the week
 * holding `checkedAt`, which is where every further minute lands. `capAt` is
 * the instant that room runs out if the timer keeps going, or null when the
 * week ends first (the next week starts empty) or there is no limit. Reaching a
 * limit exactly is allowed, as in the trigger, so the cap is passed one minute
 * after the room is used up.
 */
export function timerOutlook(reply: LimitCheckReply, checkedAt: Date, timeZone: string, weekStartsOn: number): TimerOutlook | null {
  const occurrence = reply.occurrences[0];
  if (!occurrence) return null;
  if (!occurrence.fits) {
    const reason = occurrence.badSpan ? "span" : occurrence.overlap ? "overlap" : occurrence.over ?? "global";
    return { kind: "refused", reason, overlap: occurrence.overlap };
  }
  const week = occurrence.weeks[occurrence.weeks.length - 1];
  if (!week) return { kind: "fits", limit: null, remainingMinutes: null, capAt: null };
  const rooms = [
    reply.globalLimit === null ? null : { limit: "global" as const, room: reply.globalLimit - week.globalAfter },
    reply.jobLimit === null ? null : { limit: "job" as const, room: reply.jobLimit - week.jobAfter },
  ].filter((entry) => entry !== null);
  if (!rooms.length) return { kind: "fits", limit: null, remainingMinutes: null, capAt: null };
  // The overall limit wins a tie, as the trigger checks it first.
  const tightest = rooms.reduce((best, entry) => (entry.room < best.room ? entry : best));
  const remainingMinutes = Math.max(0, tightest.room);
  const capAt = new Date(floorToMinute(checkedAt).getTime() + (remainingMinutes + 1) * MINUTE_MS);
  const weekEnd = weekEndFor(new Date(week.weekStart), timeZone, weekStartsOn);
  return { kind: "fits", limit: tightest.limit, remainingMinutes, capAt: capAt < weekEnd ? capAt : null };
}
