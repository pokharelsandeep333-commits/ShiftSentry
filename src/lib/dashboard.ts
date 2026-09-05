import { createServerSupabaseClient } from "@/lib/supabase/server";
import { allocateShiftMinutes, percentage, weekEndFor, weekStartFor } from "@/lib/time";
import type { DashboardData, JobSummary, MonthTotals, ThresholdAlert } from "@/lib/types";
import type { DeductionSnapshot } from "@/lib/earnings";
import { addWorkedMinutes, bucketWorkedShiftsByMonth, createTotals, finalizeTotals, type WorkedShift } from "@/lib/period-totals";
import { buildMonthlyJobAllocation, monthlyAllocationWindow } from "@/lib/job-allocation";

type ShiftRow = { id: string; job_id: string; starts_at: string; ends_at: string; notes: string | null; hourly_rate_cents: number; tax_rate_basis_points: number; deductions_snapshot: DeductionSnapshot[]; jobs: { name: string; color: string } };
type JobRow = { id: string; name: string; color: string; weekly_limit_minutes: number | null };
type AllTimeRow = Omit<ShiftRow, "id" | "notes">;

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

/** The tier a cap has crossed, or null while it is still comfortably under. */
function alertLevel(percent: number): ThresholdAlert["level"] | null {
  return percent >= 100 ? 100 : percent >= 90 ? 90 : percent >= 80 ? 80 : null;
}

function thresholdAlerts(globalLimit: number | null, logged: number, scheduled: number, jobs: JobSummary[]): ThresholdAlert[] {
  const alerts: ThresholdAlert[] = [];
  const globalPercent = percentage(logged + scheduled, globalLimit);
  const globalLevel = alertLevel(globalPercent);
  if (globalLevel) alerts.push({ level: globalLevel, title: globalLevel === 100 ? "Weekly cap reached" : "Approaching your weekly cap", detail: `Your planned hours reach ${globalPercent}% of your global cap.`, severity: globalLevel === 100 ? "danger" : "warning" });

  // Per-job caps warn on the same 80/90/100 ladder as the global one. They used
  // to fire only at 100%, which meant the dashboard could warn about the cap a
  // user was comfortably under while saying nothing about the job they were
  // minutes from breaching -- under a card promising alerts at all three tiers.
  jobs.forEach((job) => {
    const jobPercent = percentage(job.usedMinutes + job.scheduledMinutes, job.weeklyLimitMinutes);
    const level = alertLevel(jobPercent);
    if (!level) return;
    alerts.push({ level, title: level === 100 ? `${job.name} limit reached` : `Approaching your ${job.name} limit`, detail: `Planned hours reach ${jobPercent}% of this job's weekly cap.`, severity: level === 100 ? "danger" : "warning" });
  });
  return alerts;
}

/**
 * Every shift the user has ever started, bucketed by calendar month in their
 * own zone. The card sums whichever months a range covers on the client, so one
 * query here answers every preset and any custom span.
 *
 * Deliberately a second query rather than an extension of the dashboard window:
 * a shift straddling the six-month boundary belongs to both ranges, so bolting a
 * "before the window" query onto the windowed one would either double it or drop
 * it. Only the pay snapshot is selected, and archived jobs stay excluded here
 * exactly as they are everywhere else.
 */
async function fetchMonthTotals(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, userId: string, now: Date, timeZone: string): Promise<MonthTotals[]> {
  const shifts: WorkedShift[] = [];

  for (let page = 0; ; page += 1) {
    const { data, error } = await supabase
      .from("shifts")
      .select(SHIFT_COLUMNS)
      .eq("user_id", userId)
      .is("jobs.archived_at", null)
      .lt("starts_at", now.toISOString())
      .order("starts_at")
      .order("id")
      .range(page * ALL_TIME_PAGE_SIZE, (page + 1) * ALL_TIME_PAGE_SIZE - 1);
    if (error) throw error;

    const rows = (data ?? []) as unknown as AllTimeRow[];
    rows.forEach((row) => shifts.push({
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
  return bucketWorkedShiftsByMonth(shifts, now, timeZone);
}

export async function getDashboardData(profile: { id: string; email: string; display_name: string | null; time_zone: string; week_starts_on: number; global_weekly_limit_minutes: number | null }): Promise<DashboardData> {
  const now = new Date();
  const weekStart = weekStartFor(now, profile.time_zone, profile.week_starts_on);
  const weekEnd = weekEndFor(now, profile.time_zone, profile.week_starts_on);
  const allocationWindow = monthlyAllocationWindow(now, profile.time_zone);
  const shiftQueryEnd = weekEnd > allocationWindow.end ? weekEnd : allocationWindow.end;
  const supabase = await createServerSupabaseClient();
  const [jobsResult, shiftsResult, months] = await Promise.all([
    supabase.from("jobs").select("id,name,color,weekly_limit_minutes").eq("user_id", profile.id).is("archived_at", null).order("created_at"),
    supabase.from("shifts").select(`id,notes,${SHIFT_COLUMNS}`).eq("user_id", profile.id).is("jobs.archived_at", null).lt("starts_at", shiftQueryEnd.toISOString()).gt("ends_at", allocationWindow.start.toISOString()).order("starts_at"),
    fetchMonthTotals(supabase, profile.id, now, profile.time_zone),
  ]);
  if (jobsResult.error) throw jobsResult.error;
  if (shiftsResult.error) throw shiftsResult.error;

  const jobs = (jobsResult.data as JobRow[]).map((job) => ({ ...job, weeklyLimitMinutes: job.weekly_limit_minutes, usedMinutes: 0, scheduledMinutes: 0 }));
  const jobLookup = new Map(jobs.map((job) => [job.id, job]));
  const week = createTotals();
  const upcomingShifts: DashboardData["upcomingShifts"] = [];
  const shifts = shiftsResult.data as unknown as ShiftRow[];

  shifts.forEach((shift) => {
    const startsAt = new Date(shift.starts_at);
    const endsAt = new Date(shift.ends_at);
    const isScheduled = startsAt > now;
    const earnedEnd = endsAt < now ? endsAt : now;
    const job = jobLookup.get(shift.job_id);
    const jobRef = { id: shift.job_id, name: shift.jobs.name, color: shift.jobs.color };
    const snapshot = { hourlyRateCents: shift.hourly_rate_cents, taxRateBasisPoints: shift.tax_rate_basis_points, deductions: deductionsOf(shift) };
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
        if (allocationWeekStart.getTime() === weekStart.getTime()) addWorkedMinutes(week, allocation.minutes, jobRef, snapshot);
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
      deductions: deductionsOf(shift),
    })),
    now,
    timeZone: profile.time_zone,
    window: allocationWindow,
  });
  return { viewer: { email: profile.email, name: profile.display_name, timeZone: profile.time_zone, weekStartsOn: profile.week_starts_on }, globalLimitMinutes: profile.global_weekly_limit_minutes, loggedMinutes, scheduledMinutes, jobs, upcomingShifts: upcomingShifts.slice(0, 5), alerts: thresholdAlerts(profile.global_weekly_limit_minutes, loggedMinutes, scheduledMinutes, jobs), totals: { week: finalizeTotals(week), months }, monthlyJobAllocation };
}
