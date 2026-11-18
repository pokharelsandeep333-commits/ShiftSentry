import { cache } from "react";
import { breakPeriodForWeek } from "@/lib/break-periods";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { allocateShiftMinutes, weekEndFor, weekStartDateFor, weekStartFor } from "@/lib/time";
import type { DashboardData, MonthTotals } from "@/lib/types";
import type { DeductionSnapshot } from "@/lib/earnings";
import { addWorkedMinutes, bucketWorkedShiftsByMonth, createTotals, finalizeTotals } from "@/lib/period-totals";
import { buildMonthlyJobAllocation, monthlyAllocationWindow } from "@/lib/job-allocation";
import { allocateWeekMinutes, type WeekMeterSource } from "@/lib/week-meter";
import { getRunningTimer } from "@/lib/shift-timer-server";
import { JOB_PAY_COLUMNS, payPeriodQueryWindow, payScheduleFromColumns, summarizePayPeriods, type JobPayColumns } from "@/lib/pay-period";
import { buildDashboardInsights, recentCompletedShifts, type DashboardShift, type RecentCompletedShift } from "@/lib/dashboard-insights";

type ShiftRow = { id: string; job_id: string; starts_at: string; ends_at: string; notes: string | null; hourly_rate_cents: number; tax_rate_basis_points: number; deductions_snapshot: DeductionSnapshot[]; jobs: { name: string; color: string } };
type JobRow = JobPayColumns & { id: string; name: string; color: string; weekly_limit_minutes: number | null };
type AllTimeRow = Omit<ShiftRow, "notes">;

const SHIFT_COLUMNS = "job_id,starts_at,ends_at,hourly_rate_cents,tax_rate_basis_points,deductions_snapshot,jobs!inner(name,color)";

/**
 * PostgREST caps a response at 1,000 rows, so a long history has to be paged
 * rather than trusted to arrive whole -- a silently truncated page would
 * under-report an all-time total with no error to notice.
 */
const ALL_TIME_PAGE_SIZE = 1_000;

function deductionsOf(row: { deductions_snapshot: DeductionSnapshot[] }) {
  return Array.isArray(row.deductions_snapshot) ? row.deductions_snapshot : [];
}

/**
 * Every shift the user has ever started, bucketed by calendar month in their
 * own zone. The card sums whichever months a range covers on the client, so one
 * query here answers every preset and any custom span.
 *
 * Deliberately a second query rather than an extension of the dashboard window:
 * a shift straddling the six-month boundary belongs to both ranges, so bolting a
 * "before the window" query onto the windowed one would either double it or drop
 * it. The pay snapshot and shift id also supply the latest completed shifts,
 * and archived jobs stay excluded exactly as they are everywhere else.
 */
async function fetchHistory(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, userId: string, now: Date, timeZone: string): Promise<{ months: MonthTotals[]; recentShifts: RecentCompletedShift[] }> {
  const shifts: DashboardShift[] = [];

  for (let page = 0; ; page += 1) {
    const { data, error } = await supabase
      .from("shifts")
      .select(`id,${SHIFT_COLUMNS}`)
      .eq("user_id", userId)
      .is("jobs.archived_at", null)
      .lt("starts_at", now.toISOString())
      .order("starts_at")
      .order("id")
      .range(page * ALL_TIME_PAGE_SIZE, (page + 1) * ALL_TIME_PAGE_SIZE - 1);
    if (error) throw error;

    const rows = (data ?? []) as unknown as AllTimeRow[];
    rows.forEach((row) => shifts.push({
      id: row.id,
      jobId: row.job_id,
      jobName: row.jobs.name,
      jobColor: row.jobs.color,
      startsAt: new Date(row.starts_at),
      endsAt: new Date(row.ends_at),
      hourlyRateCents: row.hourly_rate_cents,
      taxRateBasisPoints: row.tax_rate_basis_points,
      deductions: deductionsOf(row),
    }));
    if (rows.length < ALL_TIME_PAGE_SIZE) break;
  }
  return { months: bucketWorkedShiftsByMonth(shifts, now, timeZone), recentShifts: recentCompletedShifts(shifts, now, timeZone) };
}

/**
 * The header meter's numbers, for every signed-in page. One shift query for
 * the current week plus the jobs, both through the RLS client, and the running
 * timer, which the shell adds as it ticks. A failure resolves to null and the
 * header simply draws no meter: the chrome must never take a page down with it.
 */
export async function getWeekMeter(profile: WeekProfile): Promise<WeekMeterSource | null> {
  const countedAt = new Date();
  try {
    const date = weekStartDateFor(countedAt, profile.time_zone, profile.week_starts_on);
    const [jobs, period, timer] = await Promise.all([loadCurrentWeek(profile, countedAt), loadWeekBreak(profile.id, date), getRunningTimer(profile.id).catch(() => null)]);
    if (!jobs) return null;
    const limitMinutes = period?.weekly_limit_minutes ?? profile.global_weekly_limit_minutes;
    return { jobs, limitMinutes, countedAt: countedAt.toISOString(), timer, timeZone: profile.time_zone, weekStartsOn: profile.week_starts_on };
  } catch {
    return null;
  }
}

type WeekProfile = { id: string; time_zone: string; week_starts_on: number; global_weekly_limit_minutes: number | null };

// The dashboard and shell can share the lookup within a render.
const loadWeekBreak = cache(async (userId: string, date: string) => {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from("break_periods").select("id,start_date,end_date,weekly_limit_minutes,label")
    .eq("user_id", userId).lte("start_date", date).gte("end_date", date);
  if (error) throw error;
  return breakPeriodForWeek(data, date);
});

/** Active jobs with this week's worked and scheduled minutes, archived jobs excluded as everywhere. */
async function loadCurrentWeek(profile: WeekProfile, now: Date) {
  try {
    const weekStart = weekStartFor(now, profile.time_zone, profile.week_starts_on);
    const weekEnd = weekEndFor(now, profile.time_zone, profile.week_starts_on);
    const supabase = await createServerSupabaseClient();
    const [jobsResult, shiftsResult] = await Promise.all([
      supabase.from("jobs").select("id,name,color,weekly_limit_minutes").eq("user_id", profile.id).is("archived_at", null).order("created_at"),
      supabase.from("shifts").select("job_id,starts_at,ends_at,jobs!inner(archived_at)").eq("user_id", profile.id).is("jobs.archived_at", null).lt("starts_at", weekEnd.toISOString()).gt("ends_at", weekStart.toISOString()),
    ]);
    if (jobsResult.error || shiftsResult.error) return null;
    const shifts = (shiftsResult.data as unknown as { job_id: string; starts_at: string; ends_at: string }[]).map((row) => ({ jobId: row.job_id, startsAt: new Date(row.starts_at), endsAt: new Date(row.ends_at) }));
    return allocateWeekMinutes(jobsResult.data as { id: string; name: string; color: string; weekly_limit_minutes: number | null }[], shifts, now, profile.time_zone, profile.week_starts_on);
  } catch {
    return null;
  }
}

export async function getDashboardData(profile: { id: string; email: string; display_name: string | null; time_zone: string; week_starts_on: number; global_weekly_limit_minutes: number | null }): Promise<DashboardData> {
  const now = new Date();
  const weekStartDate = weekStartDateFor(now, profile.time_zone, profile.week_starts_on);
  const weekEnd = weekEndFor(now, profile.time_zone, profile.week_starts_on);
  const nextWeekStartDate = weekStartDateFor(weekEnd, profile.time_zone, profile.week_starts_on);
  const allocationWindow = monthlyAllocationWindow(now, profile.time_zone);
  // One windowed query answers the week, the six-month chart and the pay
  // periods, so it spans whichever reaches furthest. The pay-period window is
  // wide enough for any schedule's current and previous period (pay-period.ts),
  // which keeps it independent of the jobs query it runs beside.
  const payWindow = payPeriodQueryWindow(now, profile.time_zone);
  const shiftQueryStart = payWindow.start < allocationWindow.start ? payWindow.start : allocationWindow.start;
  const shiftQueryEnd = [weekEnd, allocationWindow.end, payWindow.end].reduce((latest, bound) => bound > latest ? bound : latest);
  const supabase = await createServerSupabaseClient();
  const [jobsResult, shiftsResult, history, breakPeriod] = await Promise.all([
    supabase.from("jobs").select(`id,name,color,weekly_limit_minutes,${JOB_PAY_COLUMNS}`).eq("user_id", profile.id).is("archived_at", null).order("created_at"),
    supabase.from("shifts").select(`id,notes,${SHIFT_COLUMNS}`).eq("user_id", profile.id).is("jobs.archived_at", null).lt("starts_at", shiftQueryEnd.toISOString()).gt("ends_at", shiftQueryStart.toISOString()).order("starts_at"),
    fetchHistory(supabase, profile.id, now, profile.time_zone),
    loadWeekBreak(profile.id, weekStartDate),
  ]);
  if (jobsResult.error) throw jobsResult.error;
  if (shiftsResult.error) throw shiftsResult.error;

  const jobRows = jobsResult.data as JobRow[];
  const week = createTotals();
  const upcomingShifts: DashboardData["upcomingShifts"] = [];
  let currentShift: DashboardData["currentShift"] = null;
  const shifts = shiftsResult.data as unknown as ShiftRow[];

  shifts.forEach((shift) => {
    const startsAt = new Date(shift.starts_at);
    const endsAt = new Date(shift.ends_at);
    const earnedEnd = endsAt < now ? endsAt : now;
    const jobRef = { id: shift.job_id, name: shift.jobs.name, color: shift.jobs.color };
    const snapshot = { hourlyRateCents: shift.hourly_rate_cents, taxRateBasisPoints: shift.tax_rate_basis_points, deductions: deductionsOf(shift) };
    if (startsAt < now) {
      for (const allocation of allocateShiftMinutes(startsAt, earnedEnd, profile.time_zone)) {
        if (allocation.date >= weekStartDate && allocation.date < nextWeekStartDate) addWorkedMinutes(week, allocation.minutes, jobRef, snapshot);
      }
    }
    // The query runs past this week (the pay-period lookahead), so "next" can
    // reach into next week rather than going blank on a Saturday night.
    const summary = { id: shift.id, jobId: shift.job_id, jobName: shift.jobs.name, jobColor: shift.jobs.color, startsAt: shift.starts_at, endsAt: shift.ends_at, notes: shift.notes };
    if (startsAt > now) upcomingShifts.push(summary);
    else if (endsAt > now) currentShift = summary;
  });

  const workedShifts = shifts.map((shift) => ({
    id: shift.id,
    jobId: shift.job_id,
    jobName: shift.jobs.name,
    jobColor: shift.jobs.color,
    startsAt: new Date(shift.starts_at),
    endsAt: new Date(shift.ends_at),
    hourlyRateCents: shift.hourly_rate_cents,
    taxRateBasisPoints: shift.tax_rate_basis_points,
    deductions: deductionsOf(shift),
  }));
  const jobs = allocateWeekMinutes(jobRows.map((job) => ({ id: job.id, name: job.name, color: job.color, weeklyLimitMinutes: job.weekly_limit_minutes })), workedShifts, now, profile.time_zone, profile.week_starts_on);
  const loggedMinutes = jobs.reduce((total, job) => total + job.usedMinutes, 0);
  const scheduledMinutes = jobs.reduce((total, job) => total + job.scheduledMinutes, 0);
  const monthlyJobAllocation = buildMonthlyJobAllocation({
    shifts: workedShifts,
    now,
    timeZone: profile.time_zone,
    window: allocationWindow,
  });
  const payPeriods = summarizePayPeriods({ jobs: jobRows.map((job) => ({ id: job.id, name: job.name, color: job.color, schedule: payScheduleFromColumns(job) })), shifts: workedShifts, now, timeZone: profile.time_zone });
  return { ...buildDashboardInsights(workedShifts, now, profile.time_zone, profile.week_starts_on), recentShifts: history.recentShifts, viewer: { email: profile.email, name: profile.display_name, timeZone: profile.time_zone, weekStartsOn: profile.week_starts_on }, globalLimitMinutes: breakPeriod?.weekly_limit_minutes ?? profile.global_weekly_limit_minutes, activeBreakLabel: breakPeriod ? breakPeriod.label ?? "Break period" : null, loggedMinutes, scheduledMinutes, jobs, currentShift, upcomingShifts: upcomingShifts.slice(0, 4), totals: { week: finalizeTotals(week), months: history.months }, monthlyJobAllocation, payPeriods };
}
