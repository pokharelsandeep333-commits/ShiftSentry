import { calculateEarnings, type Earnings } from "./earnings";
import { allocateShiftMinutes } from "./time";

/**
 * The example week on the public landing page. Illustrative data, labelled as
 * such on the page, but the arithmetic is the product's: a shift is refused
 * when it would take the week *past* a limit (`>`, as in
 * `enforce_shift_weekly_limits`), so one landing exactly on the limit is
 * saved; planned shifts count toward hours but earn nothing until worked; pay
 * goes through `calculateEarnings` per job. `welcome-week.test.ts` pins the
 * numbers the page prints.
 */
export type ExampleJob = { id: string; name: string; color: string; hourlyRateCents: number; taxRateBasisPoints: number; limitMinutes: number | null };
export type ExampleShift = { jobId: string; day: string; minutes: number; planned: boolean };
export type ExampleWeek = { limitMinutes: number; alertPercent: number; jobs: ExampleJob[]; shifts: ExampleShift[] };

export const EXAMPLE_WEEK: ExampleWeek = {
  limitMinutes: 1_200,
  alertPercent: 80,
  jobs: [
    { id: "campus", name: "Campus desk", color: "#9486ff", hourlyRateCents: 1_250, taxRateBasisPoints: 1_200, limitMinutes: 720 },
    { id: "cafe", name: "River café", color: "#32d583", hourlyRateCents: 1_100, taxRateBasisPoints: 1_200, limitMinutes: null },
  ],
  shifts: [
    { jobId: "campus", day: "Mon", minutes: 240, planned: false },
    { jobId: "cafe", day: "Tue", minutes: 300, planned: false },
    { jobId: "campus", day: "Wed", minutes: 240, planned: false },
    { jobId: "campus", day: "Fri", minutes: 180, planned: true },
  ],
};

export type WeekTotals = { loggedMinutes: number; plannedMinutes: number; totalMinutes: number; percent: number; alert: boolean };

export function weekTotals(week: ExampleWeek): WeekTotals {
  const loggedMinutes = sum(week.shifts.filter((shift) => !shift.planned));
  const plannedMinutes = sum(week.shifts.filter((shift) => shift.planned));
  const totalMinutes = loggedMinutes + plannedMinutes;
  const percent = Math.round((totalMinutes / week.limitMinutes) * 100);
  return { loggedMinutes, plannedMinutes, totalMinutes, percent, alert: percent >= week.alertPercent };
}

export function jobMinutes(week: ExampleWeek, jobId: string) {
  return sum(week.shifts.filter((shift) => shift.jobId === jobId));
}

export type ShiftAttempt = { jobId: string; minutes: number };
export type AttemptResult = { status: "saved" | "refused"; reason: "global" | "job" | null; totalMinutes: number; overByMinutes: number };

/** The same two checks the trigger makes, in the same order: global, then the job's own limit. */
export function tryShift(week: ExampleWeek, attempt: ShiftAttempt): AttemptResult {
  const totalMinutes = weekTotals(week).totalMinutes + attempt.minutes;
  if (totalMinutes > week.limitMinutes) return { status: "refused", reason: "global", totalMinutes, overByMinutes: totalMinutes - week.limitMinutes };

  const job = week.jobs.find((candidate) => candidate.id === attempt.jobId);
  const jobTotal = jobMinutes(week, attempt.jobId) + attempt.minutes;
  if (job?.limitMinutes != null && jobTotal > job.limitMinutes) return { status: "refused", reason: "job", totalMinutes, overByMinutes: jobTotal - job.limitMinutes };

  return { status: "saved", reason: null, totalMinutes, overByMinutes: 0 };
}

/** Worked shifts only, one `calculateEarnings` per job, then summed. */
export function earnedSoFar(week: ExampleWeek): Earnings {
  return week.jobs.reduce<Earnings>((total, job) => {
    const worked = sum(week.shifts.filter((shift) => shift.jobId === job.id && !shift.planned));
    const earnings = calculateEarnings(worked, { hourlyRateCents: job.hourlyRateCents, taxRateBasisPoints: job.taxRateBasisPoints, deductions: [] });
    return {
      grossCents: total.grossCents + earnings.grossCents,
      taxCents: total.taxCents + earnings.taxCents,
      deductionCents: total.deductionCents + earnings.deductionCents,
      netCents: total.netCents + earnings.netCents,
    };
  }, { grossCents: 0, taxCents: 0, deductionCents: 0, netCents: 0 });
}

/**
 * `shifts_no_overlap` compares `tstzrange(starts_at, ends_at, '[)')`: half-open,
 * so a shift ending at 4pm and one starting at 4pm touch without overlapping.
 * Times here are minutes since midnight, which is all the landing page needs.
 */
export type ExampleSpan = { startMinute: number; endMinute: number };

export function spansOverlap(a: ExampleSpan, b: ExampleSpan) {
  return a.startMinute < b.endMinute && b.startMinute < a.endMinute;
}

/** The overlap card: a desk shift, a back-to-back café shift, and one that collides with the desk. */
export const EXAMPLE_DAY = {
  desk: { startMinute: 12 * 60, endMinute: 16 * 60 },
  cafe: { startMinute: 16 * 60, endMinute: 20 * 60 },
  clash: { startMinute: 15 * 60, endMinute: 18 * 60 },
} satisfies Record<string, ExampleSpan>;

/**
 * The overnight card: Friday 10pm to Saturday 4am, split at local midnight by
 * the same `allocateShiftMinutes` every total uses. UTC keeps it deterministic;
 * the real app splits in the viewer's own zone.
 */
export const EXAMPLE_OVERNIGHT = allocateShiftMinutes(new Date("2026-10-02T22:00:00Z"), new Date("2026-10-03T04:00:00Z"), "UTC").map((allocation) => ({
  ...allocation,
  day: new Intl.DateTimeFormat("en-US", { weekday: "short", timeZone: "UTC" }).format(new Date(`${allocation.date}T12:00:00Z`)),
}));

/** The pay card: one 4h desk shift priced by `calculateEarnings`, as the trigger snapshots it. */
export const EXAMPLE_RECEIPT = {
  minutes: 240,
  hourlyRateCents: EXAMPLE_WEEK.jobs[0].hourlyRateCents,
  taxRateBasisPoints: EXAMPLE_WEEK.jobs[0].taxRateBasisPoints,
  ...calculateEarnings(240, { hourlyRateCents: EXAMPLE_WEEK.jobs[0].hourlyRateCents, taxRateBasisPoints: EXAMPLE_WEEK.jobs[0].taxRateBasisPoints, deductions: [] }),
};

function sum(shifts: ExampleShift[]) {
  return shifts.reduce((total, shift) => total + shift.minutes, 0);
}
