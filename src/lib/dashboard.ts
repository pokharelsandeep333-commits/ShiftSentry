import { createServerSupabaseClient } from "@/lib/supabase/server";
import { allocateShiftMinutes, percentage, weekEndFor, weekStartFor } from "@/lib/time";
import type { DashboardData, JobSummary, ThresholdAlert } from "@/lib/types";
import { calculateEarnings, type DeductionSnapshot } from "@/lib/earnings";
import { buildMonthlyJobAllocation, monthlyAllocationWindow } from "@/lib/job-allocation";

type ShiftRow = { id: string; job_id: string; starts_at: string; ends_at: string; notes: string | null; hourly_rate_cents: number; tax_rate_basis_points: number; deductions_snapshot: DeductionSnapshot[]; jobs: { name: string; color: string } };
type JobRow = { id: string; name: string; color: string; weekly_limit_minutes: number | null };

function thresholdAlerts(globalLimit: number | null, logged: number, scheduled: number, jobs: JobSummary[]): ThresholdAlert[] {
  const alerts: ThresholdAlert[] = [];
  const projected = logged + scheduled;
  const levelFor = (value: number, limit: number | null) => limit ? percentage(value, limit) : 0;
  const globalPercent = levelFor(projected, globalLimit);
  const globalLevel = globalPercent >= 100 ? 100 : globalPercent >= 90 ? 90 : globalPercent >= 80 ? 80 : null;
  if (globalLevel) alerts.push({ level: globalLevel, title: globalLevel === 100 ? "Weekly cap reached" : "Approaching your weekly cap", detail: `Your planned hours reach ${globalPercent}% of your global cap.`, severity: globalLevel === 100 ? "danger" : "warning" });
  jobs.forEach((job) => {
    const value = job.usedMinutes + job.scheduledMinutes;
    const jobPercent = levelFor(value, job.weeklyLimitMinutes);
    if (jobPercent >= 100) alerts.push({ level: 100, title: `${job.name} limit reached`, detail: `Planned hours equal ${jobPercent}% of this job's weekly cap.`, severity: "danger" });
  });
  return alerts;
}

export async function getDashboardData(profile: { id: string; email: string; display_name: string | null; time_zone: string; week_starts_on: number; global_weekly_limit_minutes: number | null }): Promise<DashboardData> {
  const now = new Date();
  const weekStart = weekStartFor(now, profile.time_zone, profile.week_starts_on);
  const weekEnd = weekEndFor(now, profile.time_zone, profile.week_starts_on);
  const allocationWindow = monthlyAllocationWindow(now, profile.time_zone);
  const shiftQueryEnd = weekEnd > allocationWindow.end ? weekEnd : allocationWindow.end;
  const supabase = await createServerSupabaseClient();
  const [jobsResult, shiftsResult] = await Promise.all([
    supabase.from("jobs").select("id,name,color,weekly_limit_minutes").eq("user_id", profile.id).is("archived_at", null).order("created_at"),
    supabase.from("shifts").select("id,job_id,starts_at,ends_at,notes,hourly_rate_cents,tax_rate_basis_points,deductions_snapshot,jobs!inner(name,color)").eq("user_id", profile.id).is("jobs.archived_at", null).lt("starts_at", shiftQueryEnd.toISOString()).gt("ends_at", allocationWindow.start.toISOString()).order("starts_at"),
  ]);
  if (jobsResult.error) throw jobsResult.error;
  if (shiftsResult.error) throw shiftsResult.error;

  const jobs = (jobsResult.data as JobRow[]).map((job) => ({ ...job, weeklyLimitMinutes: job.weekly_limit_minutes, usedMinutes: 0, scheduledMinutes: 0, earnedNetCents: 0 }));
  const jobLookup = new Map(jobs.map((job) => [job.id, job]));
  const earnings = { grossCents: 0, taxCents: 0, deductionCents: 0, netCents: 0 };
  const upcomingShifts: DashboardData["upcomingShifts"] = [];
  const shifts = shiftsResult.data as unknown as ShiftRow[];

  shifts.forEach((shift) => {
    const startsAt = new Date(shift.starts_at);
    const endsAt = new Date(shift.ends_at);
    const isScheduled = startsAt > now;
    const earnedEnd = endsAt < now ? endsAt : now;
    const job = jobLookup.get(shift.job_id);
    for (const allocation of allocateShiftMinutes(startsAt, endsAt, profile.time_zone)) {
      const localNoon = new Date(`${allocation.date}T12:00:00Z`);
      const allocationWeekStart = weekStartFor(localNoon, profile.time_zone, profile.week_starts_on);
      if (allocationWeekStart.getTime() === weekStart.getTime() && job) {
        if (isScheduled) job.scheduledMinutes += allocation.minutes;
        else job.usedMinutes += allocation.minutes;
      }
    }
    if (startsAt < now) {
      for (const allocation of allocateShiftMinutes(startsAt, earnedEnd, profile.time_zone)) {
        const localNoon = new Date(`${allocation.date}T12:00:00Z`);
        const allocationWeekStart = weekStartFor(localNoon, profile.time_zone, profile.week_starts_on);
        const earned = calculateEarnings(allocation.minutes, { hourlyRateCents: shift.hourly_rate_cents, taxRateBasisPoints: shift.tax_rate_basis_points, deductions: Array.isArray(shift.deductions_snapshot) ? shift.deductions_snapshot : [] });
        if (allocationWeekStart.getTime() === weekStart.getTime()) { earnings.grossCents += earned.grossCents; earnings.taxCents += earned.taxCents; earnings.deductionCents += earned.deductionCents; earnings.netCents += earned.netCents; if (job) job.earnedNetCents += earned.netCents; }
      }
    }
    if (startsAt > now && startsAt < weekEnd) upcomingShifts.push({ id: shift.id, jobId: shift.job_id, jobName: shift.jobs.name, jobColor: shift.jobs.color, startsAt: shift.starts_at, endsAt: shift.ends_at, notes: shift.notes });
  });

  const loggedMinutes = jobs.reduce((total, job) => total + job.usedMinutes, 0);
  const scheduledMinutes = jobs.reduce((total, job) => total + job.scheduledMinutes, 0);
  const monthlyJobAllocation = buildMonthlyJobAllocation({
    shifts: shifts.map((shift) => ({
      jobId: shift.job_id,
      jobName: shift.jobs.name,
      jobColor: shift.jobs.color,
      startsAt: new Date(shift.starts_at),
      endsAt: new Date(shift.ends_at),
      hourlyRateCents: shift.hourly_rate_cents,
      taxRateBasisPoints: shift.tax_rate_basis_points,
      deductions: Array.isArray(shift.deductions_snapshot) ? shift.deductions_snapshot : [],
    })),
    now,
    timeZone: profile.time_zone,
    window: allocationWindow,
  });
  return { viewer: { email: profile.email, name: profile.display_name, timeZone: profile.time_zone, weekStartsOn: profile.week_starts_on }, globalLimitMinutes: profile.global_weekly_limit_minutes, loggedMinutes, scheduledMinutes, jobs, upcomingShifts: upcomingShifts.slice(0, 5), alerts: thresholdAlerts(profile.global_weekly_limit_minutes, loggedMinutes, scheduledMinutes, jobs), earnings, monthlyJobAllocation };
}
