import { addMonths, subMonths } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { calculateEarnings, type DeductionSnapshot } from "@/lib/earnings";
import { allocateShiftMinutes } from "@/lib/time";
import type { MonthlyJobAllocation } from "@/lib/types";

type MonthDefinition = { key: string; label: string };

export type MonthlyAllocationWindow = {
  months: MonthDefinition[];
  start: Date;
  end: Date;
};

export type MonthlyAllocationShift = {
  jobId: string;
  jobName: string;
  jobColor: string;
  startsAt: Date;
  endsAt: Date;
  hourlyRateCents: number;
  taxRateBasisPoints: number;
  deductions: DeductionSnapshot[];
};

type JobTotals = {
  id: string;
  name: string;
  color: string;
  netCents: number;
  loggedMinutes: number;
};

function monthAtNoon(key: string) {
  return new Date(`${key}-01T12:00:00Z`);
}

export function monthlyAllocationWindow(now: Date, timeZone: string, monthCount = 6): MonthlyAllocationWindow {
  const currentMonth = formatInTimeZone(now, timeZone, "yyyy-MM");
  const currentMonthNoon = monthAtNoon(currentMonth);
  const months = Array.from({ length: monthCount }, (_, index) => {
    const date = subMonths(currentMonthNoon, monthCount - index - 1);
    return { key: formatInTimeZone(date, "UTC", "yyyy-MM"), label: formatInTimeZone(date, "UTC", "MMM") };
  });
  const firstMonth = months[0];
  const afterCurrentMonth = formatInTimeZone(addMonths(currentMonthNoon, 1), "UTC", "yyyy-MM");

  return {
    months,
    start: fromZonedTime(`${firstMonth.key}-01T00:00`, timeZone),
    end: fromZonedTime(`${afterCurrentMonth}-01T00:00`, timeZone),
  };
}

export function buildMonthlyJobAllocation({ shifts, now, timeZone, window }: {
  shifts: MonthlyAllocationShift[];
  now: Date;
  timeZone: string;
  window: MonthlyAllocationWindow;
}): MonthlyJobAllocation {
  const monthKeys = new Set(window.months.map((month) => month.key));
  const monthTotals = new Map(window.months.map((month) => [month.key, { netCents: {} as Record<string, number>, loggedMinutes: {} as Record<string, number> }]));
  const jobs = new Map<string, JobTotals>();

  shifts.forEach((shift) => {
    const earnedEnd = shift.endsAt < now ? shift.endsAt : now;
    if (earnedEnd <= shift.startsAt) return;

    for (const allocation of allocateShiftMinutes(shift.startsAt, earnedEnd, timeZone)) {
      const monthKey = allocation.date.slice(0, 7);
      if (!monthKeys.has(monthKey)) continue;
      const month = monthTotals.get(monthKey);
      if (!month) continue;

      const earned = calculateEarnings(allocation.minutes, {
        hourlyRateCents: shift.hourlyRateCents,
        taxRateBasisPoints: shift.taxRateBasisPoints,
        deductions: shift.deductions,
      });
      month.netCents[shift.jobId] = (month.netCents[shift.jobId] ?? 0) + earned.netCents;
      month.loggedMinutes[shift.jobId] = (month.loggedMinutes[shift.jobId] ?? 0) + allocation.minutes;

      const job = jobs.get(shift.jobId) ?? { id: shift.jobId, name: shift.jobName, color: shift.jobColor, netCents: 0, loggedMinutes: 0 };
      job.netCents += earned.netCents;
      job.loggedMinutes += allocation.minutes;
      jobs.set(shift.jobId, job);
    }
  });

  const rankedJobs = Array.from(jobs.values()).sort((left, right) => right.netCents - left.netCents || right.loggedMinutes - left.loggedMinutes || left.name.localeCompare(right.name));
  const selectedJobs = rankedJobs.slice(0, 9);
  const otherJobIds = new Set(rankedJobs.slice(9).map((job) => job.id));
  const series = selectedJobs.map((job) => ({ id: job.id, key: `job-${job.id}`, name: job.name, color: job.color }));
  if (otherJobIds.size) series.push({ id: "other", key: "other", name: "Other", color: "#98a2b3" });

  return {
    series,
    months: window.months.map((month) => {
      const totals = monthTotals.get(month.key) ?? { netCents: {}, loggedMinutes: {} };
      const netCents: Record<string, number> = {};
      const loggedMinutes: Record<string, number> = {};

      selectedJobs.forEach((job) => {
        const key = `job-${job.id}`;
        netCents[key] = totals.netCents[job.id] ?? 0;
        loggedMinutes[key] = totals.loggedMinutes[job.id] ?? 0;
      });
      if (otherJobIds.size) {
        netCents.other = Array.from(otherJobIds).reduce((total, jobId) => total + (totals.netCents[jobId] ?? 0), 0);
        loggedMinutes.other = Array.from(otherJobIds).reduce((total, jobId) => total + (totals.loggedMinutes[jobId] ?? 0), 0);
      }

      return { key: month.key, label: month.label, netCents, loggedMinutes };
    }),
  };
}
