import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { addDays, type PayPeriodSummary } from "@/lib/pay-period";
import { addWorkedMinutes, createTotals, finalizeTotals, type WorkedShift } from "@/lib/period-totals";
import { allocateShiftMinutes, weekStartFor, weekEndFor } from "@/lib/time";
import type { PeriodJobTotal, ShiftSummary } from "@/lib/types";

export type DashboardShift = WorkedShift & { id: string };
export type RecentCompletedShift = ShiftSummary & { minutes: number; netCents: number };
export type WorkDay = {
  date: string;
  weekday: string;
  dayNumber: string;
  isToday: boolean;
  workedMinutes: number;
  scheduledMinutes: number;
  shifts: (ShiftSummary & { minutes: number })[];
};

/** Uses the same per-local-day rounding as every existing earnings total. */
function workedWithin(shifts: WorkedShift[], start: Date, end: Date, timeZone: string) {
  const total = createTotals();
  for (const shift of shifts) {
    const first = shift.startsAt > start ? shift.startsAt : start;
    const last = shift.endsAt < end ? shift.endsAt : end;
    if (last <= first) continue;
    for (const slice of allocateShiftMinutes(first, last, timeZone)) {
      addWorkedMinutes(total, slice.minutes, { id: shift.jobId, name: shift.jobName, color: shift.jobColor }, shift);
    }
  }
  return finalizeTotals(total);
}

/** Derived from the dashboard's existing RLS query; no additional requests. */
export function buildDashboardInsights(shifts: DashboardShift[], now: Date, timeZone: string, weekStartsOn: number) {
  const start = weekStartFor(now, timeZone, weekStartsOn);
  const end = weekEndFor(now, timeZone, weekStartsOn);
  const firstDay = formatInTimeZone(start, timeZone, "yyyy-MM-dd");
  const today = formatInTimeZone(now, timeZone, "yyyy-MM-dd");
  const days: WorkDay[] = Array.from({ length: 7 }, (_, index) => {
    const date = addDays(firstDay, index);
    return { date, weekday: formatInTimeZone(`${date}T12:00:00Z`, "UTC", "EEE"), dayNumber: String(Number(date.slice(-2))), isToday: date === today, workedMinutes: 0, scheduledMinutes: 0, shifts: [] };
  });
  const lookup = new Map(days.map((day) => [day.date, day]));
  for (const shift of shifts) {
    const first = shift.startsAt > start ? shift.startsAt : start;
    const last = shift.endsAt < end ? shift.endsAt : end;
    if (last <= first) continue;
    const worked = new Map(allocateShiftMinutes(first, last < now ? last : now, timeZone).map((slice) => [slice.date, slice.minutes]));
    for (const slice of allocateShiftMinutes(first, last, timeZone)) {
      const day = lookup.get(slice.date);
      if (!day) continue;
      const minutes = Math.min(slice.minutes, worked.get(slice.date) ?? 0);
      day.workedMinutes += minutes;
      day.scheduledMinutes += slice.minutes - minutes;
      day.shifts.push({ id: shift.id, jobId: shift.jobId, jobName: shift.jobName, jobColor: shift.jobColor, startsAt: shift.startsAt.toISOString(), endsAt: shift.endsAt.toISOString(), minutes: slice.minutes });
    }
  }
  days.forEach((day) => day.shifts.sort((a, b) => a.startsAt.localeCompare(b.startsAt)));

  // Shift local dates, not 168 hours: DST must not move the comparison by an hour.
  const previousStart = fromZonedTime(`${addDays(firstDay, -7)}T00:00:00`, timeZone);
  const previousThrough = fromZonedTime(`${addDays(today, -7)}T${formatInTimeZone(now, timeZone, "HH:mm:ss.SSS")}`, timeZone);
  const remaining = workedWithin(shifts, now, end, timeZone);
  return {
    snapshotAt: now.toISOString(),
    weekDays: days,
    weekForecast: {
      remainingMinutes: remaining.minutes,
      remainingNetCents: remaining.earnings.netCents,
      remainingShiftCount: shifts.filter((shift) => shift.endsAt > now && shift.startsAt < end).length,
    },
    weekComparison: {
      previous: workedWithin(shifts, previousStart, previousThrough, timeZone),
      throughLabel: formatInTimeZone(now, timeZone, "EEEE, h:mm a"),
    },
  };
}

/** Completed shifts only; use the paged history so old but latest work still appears. */
export function recentCompletedShifts(shifts: DashboardShift[], now: Date, timeZone: string): RecentCompletedShift[] {
  return shifts.filter((shift) => shift.endsAt <= now && shift.endsAt > shift.startsAt)
    .sort((a, b) => b.endsAt.getTime() - a.endsAt.getTime() || a.id.localeCompare(b.id))
    .slice(0, 5)
    .map((shift) => {
      const total = workedWithin([shift], shift.startsAt, shift.endsAt, timeZone);
      return { id: shift.id, jobId: shift.jobId, jobName: shift.jobName, jobColor: shift.jobColor, startsAt: shift.startsAt.toISOString(), endsAt: shift.endsAt.toISOString(), minutes: total.minutes, netCents: total.earnings.netCents };
    });
}

/** Derive a comparison rate from earned pay, never from today's configured job rate. */
export function jobEarningsBreakdown(jobs: PeriodJobTotal[]) {
  const netTotal = jobs.reduce((total, job) => total + job.netCents, 0);
  return [...jobs].sort((a, b) => b.netCents - a.netCents || b.minutes - a.minutes || a.name.localeCompare(b.name))
    .map((job) => ({ ...job, netPerHourCents: job.minutes > 0 ? Math.round(job.netCents * 60 / job.minutes) : null, sharePercent: netTotal > 0 ? Math.round(job.netCents / netTotal * 100) : null }));
}

/** A prior period can be the next payment when payroll pays in arrears. */
export function nextPaydayFor(periods: PayPeriodSummary[], today: string) {
  const candidates = periods.flatMap((job) => [
    { payday: job.previous.payday, netCents: job.previous.worked.netCents, minutes: job.previous.worked.minutes, jobId: job.jobId, jobName: job.jobName, jobColor: job.jobColor },
    { payday: job.current.payday, netCents: job.current.worked.netCents + job.current.scheduled.netCents, minutes: job.current.worked.minutes + job.current.scheduled.minutes, jobId: job.jobId, jobName: job.jobName, jobColor: job.jobColor },
  ]).filter((entry): entry is typeof entry & { payday: string } => entry.payday !== null && entry.payday >= today && entry.minutes > 0);
  candidates.sort((a, b) => a.payday.localeCompare(b.payday) || a.jobName.localeCompare(b.jobName));
  const date = candidates[0]?.payday;
  if (!date) return null;
  const jobs = candidates.filter((entry) => entry.payday === date);
  return { date, jobs, netCents: jobs.reduce((total, job) => total + job.netCents, 0) };
}
