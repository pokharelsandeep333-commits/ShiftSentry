import { weekEndFor, weekStartFor } from "@/lib/time";

export type ExistingShift = { id: string; jobId: string; startsAt: Date; endsAt: Date };
export type Occurrence = { startsAt: Date; endsAt: Date };

export type WeekCheck = {
  weekStart: Date;
  /** Minutes of this shift inside the week. */
  minutes: number;
  /** Totals once this shift is added: every job, and this shift's job. */
  globalAfter: number;
  jobAfter: number;
};

export type OccurrenceCheck = Occurrence & {
  weeks: WeekCheck[];
  /** Which limit it would break, if any; the overall one is checked first, as the trigger does. */
  over: "global" | "job" | null;
  overlap: ExistingShift | null;
  /** Not after its start, or longer than 24 hours. */
  badSpan: boolean;
  fits: boolean;
};

const DAY_MS = 86_400_000;

/** A shift's minutes inside [start, end), rounded per shift the way the trigger rounds them. */
function minutesWithin(shift: Occurrence, start: Date, end: Date) {
  const from = Math.max(shift.startsAt.getTime(), start.getTime());
  const to = Math.min(shift.endsAt.getTime(), end.getTime());
  return to > from ? Math.round((to - from) / 60_000) : 0;
}

/**
 * Would these shifts be accepted? An on-screen estimate that mirrors what the
 * database enforces, so the form can say so before Save:
 *
 * - `enforce_shift_weekly_limits` (202608250004): for every user-local week the
 *   shift touches, existing minutes in that week (every shift, archived jobs'
 *   included, the one being edited excluded) plus this shift's minutes must
 *   not be *more than* the limit, overall and for the job. Reaching the limit
 *   exactly is allowed. The week boundary is `weekStartFor` / `weekEndFor`,
 *   which CLAUDE.md requires to match the trigger's expression.
 * - `shifts_no_overlap`: no two of the user's shifts may overlap, half-open,
 *   so back-to-back shifts are fine.
 * - The 24-hour ceiling.
 *
 * Occurrences are the shift and its weekly repeats, in order. `createShift`
 * inserts them one at a time and skips any the database refuses, so an
 * accepted one counts toward the next and a refused one does not.
 *
 * Advisory only: the database decides on Save, and this can be wrong if
 * something else writes a shift in between.
 */
export function checkOccurrences({ occurrences, jobId, existing, excludeId, timeZone, weekStartsOn, globalLimit, jobLimit }: {
  occurrences: Occurrence[];
  jobId: string;
  existing: ExistingShift[];
  excludeId?: string | null;
  timeZone: string;
  weekStartsOn: number;
  globalLimit: number | null;
  jobLimit: number | null;
}): OccurrenceCheck[] {
  const placed = existing.filter((shift) => shift.id !== excludeId);
  const results: OccurrenceCheck[] = [];

  occurrences.forEach((occurrence, index) => {
    const span = occurrence.endsAt.getTime() - occurrence.startsAt.getTime();
    const badSpan = span <= 0 || span > DAY_MS;
    const overlap = badSpan ? null : placed.find((shift) => shift.startsAt < occurrence.endsAt && shift.endsAt > occurrence.startsAt) ?? null;

    const weeks: WeekCheck[] = [];
    let over: OccurrenceCheck["over"] = null;
    if (!badSpan) {
      let weekStart = weekStartFor(occurrence.startsAt, timeZone, weekStartsOn);
      while (weekStart < occurrence.endsAt) {
        const weekEnd = weekEndFor(weekStart, timeZone, weekStartsOn);
        const minutes = minutesWithin(occurrence, weekStart, weekEnd);
        if (minutes > 0) {
          let existingGlobal = 0;
          let existingJob = 0;
          for (const shift of placed) {
            if (shift.startsAt >= weekEnd || shift.endsAt <= weekStart) continue;
            const within = minutesWithin(shift, weekStart, weekEnd);
            existingGlobal += within;
            if (shift.jobId === jobId) existingJob += within;
          }
          const check = { weekStart, minutes, globalAfter: existingGlobal + minutes, jobAfter: existingJob + minutes };
          weeks.push(check);
          if (!over && globalLimit !== null && check.globalAfter > globalLimit) over = "global";
          if (!over && jobLimit !== null && check.jobAfter > jobLimit) over = "job";
        }
        weekStart = weekEnd;
      }
    }

    const fits = !badSpan && !overlap && !over;
    results.push({ ...occurrence, weeks, over, overlap, badSpan, fits });
    if (fits) placed.push({ id: `candidate-${index}`, jobId, startsAt: occurrence.startsAt, endsAt: occurrence.endsAt });
  });

  return results;
}
