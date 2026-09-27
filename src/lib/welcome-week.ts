import { calculateEarnings, type Earnings } from "./earnings";

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

function sum(shifts: ExampleShift[]) {
  return shifts.reduce((total, shift) => total + shift.minutes, 0);
}
