import { calculateEarnings, type DeductionSnapshot } from "@/lib/earnings";
import { monthKeyLabel, monthKeyOf, monthKeysBetween } from "@/lib/earnings-range";
import { allocateShiftMinutes } from "@/lib/time";
import type { EarningsSummary, MonthTotals, PeriodJobTotal, PeriodTotals } from "@/lib/types";

export type WorkedShift = {
  jobId: string;
  jobName: string;
  jobColor: string;
  startsAt: Date;
  endsAt: Date;
  hourlyRateCents: number;
  taxRateBasisPoints: number;
  deductions: DeductionSnapshot[];
};

/** Mutable while a query is being walked; `finalizeTotals` freezes it for the view. */
export type TotalsAccumulator = {
  minutes: number;
  earnings: EarningsSummary;
  jobs: Map<string, PeriodJobTotal>;
};

export function createTotals(): TotalsAccumulator {
  return { minutes: 0, earnings: { grossCents: 0, taxCents: 0, deductionCents: 0, netCents: 0 }, jobs: new Map() };
}

/**
 * Add one slice of already-worked time.
 *
 * Callers pass minutes that have been split at local midnights and clipped at
 * `now`, so every period -- this week, six months, all time -- rounds once per
 * slice in exactly the same places. Totalling a whole span in one call instead
 * would round differently, and the same shift would then contribute a cent more
 * to "all time" than it did to "this week", which is the first thing anyone
 * flipping the period switch would notice.
 */
export function addWorkedMinutes(totals: TotalsAccumulator, minutes: number, job: { id: string; name: string; color: string }, snapshot: { hourlyRateCents: number; taxRateBasisPoints: number; deductions: DeductionSnapshot[] }) {
  const earned = calculateEarnings(minutes, snapshot);
  totals.minutes += minutes;
  totals.earnings.grossCents += earned.grossCents;
  totals.earnings.taxCents += earned.taxCents;
  totals.earnings.deductionCents += earned.deductionCents;
  totals.earnings.netCents += earned.netCents;

  const existing = totals.jobs.get(job.id) ?? { id: job.id, name: job.name, color: job.color, netCents: 0, minutes: 0 };
  existing.netCents += earned.netCents;
  existing.minutes += minutes;
  totals.jobs.set(job.id, existing);
}

/** Highest earning job first, so the breakdown leads with what actually pays. */
export function finalizeTotals(totals: TotalsAccumulator): PeriodTotals {
  return {
    minutes: totals.minutes,
    earnings: totals.earnings,
    jobs: Array.from(totals.jobs.values()).sort((left, right) => right.netCents - left.netCents || right.minutes - left.minutes || left.name.localeCompare(right.name)),
  };
}

/**
 * Every shift that has started, bucketed into the calendar months it was worked
 * in, counting an in-progress shift only up to `now`.
 *
 * Future shifts contribute nothing: their `*_cents` columns are already
 * populated by the earnings trigger for the whole span, so summing the column
 * would report money nobody has earned yet.
 *
 * The result is contiguous from the first month worked to the month in
 * progress, so a month nobody worked still has a bucket. Every range the card
 * offers is then a slice of this array rather than a lookup that can miss.
 */
export function bucketWorkedShiftsByMonth(shifts: WorkedShift[], now: Date, timeZone: string): MonthTotals[] {
  const buckets = new Map<string, TotalsAccumulator>();

  for (const shift of shifts) {
    const earnedEnd = shift.endsAt < now ? shift.endsAt : now;
    if (earnedEnd <= shift.startsAt) continue;
    for (const allocation of allocateShiftMinutes(shift.startsAt, earnedEnd, timeZone)) {
      const key = allocation.date.slice(0, 7);
      const bucket = buckets.get(key) ?? createTotals();
      addWorkedMinutes(bucket, allocation.minutes, { id: shift.jobId, name: shift.jobName, color: shift.jobColor }, shift);
      buckets.set(key, bucket);
    }
  }

  const earliest = Array.from(buckets.keys()).sort()[0];
  if (!earliest) return [];

  return monthKeysBetween(earliest, monthKeyOf(now, timeZone)).map((key) => ({
    key,
    label: monthKeyLabel(key),
    ...finalizeTotals(buckets.get(key) ?? createTotals()),
  }));
}

/**
 * Add a span of months into one total.
 *
 * Months are themselves built from per-slice rounding, so summing them lands on
 * exactly the figure a single pass over the same shifts would -- which is what
 * lets the client re-total a range without asking the server to redo the work.
 */
export function combineMonthTotals(months: readonly MonthTotals[]): PeriodTotals {
  const combined = createTotals();

  for (const month of months) {
    combined.minutes += month.minutes;
    combined.earnings.grossCents += month.earnings.grossCents;
    combined.earnings.taxCents += month.earnings.taxCents;
    combined.earnings.deductionCents += month.earnings.deductionCents;
    combined.earnings.netCents += month.earnings.netCents;
    for (const job of month.jobs) {
      const existing = combined.jobs.get(job.id) ?? { ...job, netCents: 0, minutes: 0 };
      existing.netCents += job.netCents;
      existing.minutes += job.minutes;
      combined.jobs.set(job.id, existing);
    }
  }
  return finalizeTotals(combined);
}
