import { formatInTimeZone } from "date-fns-tz";
import type { BreakPeriod } from "@/lib/break-periods";
import type { DeductionSnapshot } from "@/lib/earnings";
import { JOB_PAY_COLUMNS, describePaySchedule, payPeriodsBack, payScheduleFromColumns, type JobPayColumns, type PayPeriod } from "@/lib/pay-period";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buildTimesheet, timesheetPeriodFor, timesheetQueryWindow, type CapShift, type Timesheet, type TimesheetParams, type TimesheetScope, type TimesheetShift } from "@/lib/timesheet";

/** How many periods the picker offers, newest first: a year of biweekly pay. */
export const TIMESHEET_PERIOD_OPTIONS = 26;
const PAGE = 1_000;

export type TimesheetJobOption = { id: string; name: string; color: string };

export type TimesheetData = {
  jobs: TimesheetJobOption[];
  selected: (TimesheetJobOption & { scheduleLabel: string; weeklyLimitMinutes: number | null }) | null;
  periods: PayPeriod[];
  today: string;
  scope: TimesheetScope;
  sheet: Timesheet | null;
};

type JobRow = JobPayColumns & { id: string; name: string; color: string; weekly_limit_minutes: number | null };
type ShiftRow = { id: string; job_id: string; starts_at: string; ends_at: string; hourly_rate_cents: number; tax_rate_basis_points: number; deductions_snapshot: DeductionSnapshot[]; jobs: { name: string; color: string } };
type CapRow = { id: string; starts_at: string; ends_at: string };

type Profile = { id: string; time_zone: string; week_starts_on: number; global_weekly_limit_minutes: number | null };

/** Every page of a query, past PostgREST's 1,000-row cap: a truncated page would under-report hours with no error to notice. */
async function allPages<T>(page: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) throw error;
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < PAGE) return rows;
  }
}

/**
 * One pay period's timesheet, through the RLS client. The period comes from a
 * job's pay schedule (`payPeriodFor`, the one place a schedule becomes a
 * period); only active, scheduled jobs are offered, as on `/pay-periods`.
 *
 * Two shift reads, kept apart on purpose:
 * - the rows: shifts of active jobs inside the period, archived jobs filtered
 *   in the query, as the dashboard does, so hours and pay drop out together;
 * - the cap check: start and end of every shift in the whole weeks the period
 *   touches, archived jobs included, because the weekly-limit trigger counts
 *   them and the "stayed under" line must describe what was enforced.
 */
export async function getTimesheet(profile: Profile, params: TimesheetParams, now = new Date()): Promise<TimesheetData> {
  const supabase = await createServerSupabaseClient();
  const today = formatInTimeZone(now, profile.time_zone, "yyyy-MM-dd");
  const { data: jobRows, error: jobsError } = await supabase.from("jobs").select(`id,name,color,weekly_limit_minutes,${JOB_PAY_COLUMNS}`).eq("user_id", profile.id).is("archived_at", null).order("created_at");
  if (jobsError) throw jobsError;

  const scheduled = (jobRows as JobRow[]).flatMap((row) => {
    const schedule = payScheduleFromColumns(row);
    return schedule ? [{ row, schedule }] : [];
  });
  const jobs = scheduled.map(({ row }) => ({ id: row.id, name: row.name, color: row.color }));
  const chosen = scheduled.find(({ row }) => row.id === params.job) ?? scheduled[0];
  if (!chosen) return { jobs, selected: null, periods: [], today, scope: params.scope, sheet: null };

  const period = timesheetPeriodFor(params.start, today, chosen.schedule);
  const periods = payPeriodsBack(today, chosen.schedule, TIMESHEET_PERIOD_OPTIONS);
  if (!periods.some((option) => option.start === period.start)) periods.push(period);
  periods.sort((a, b) => b.start.localeCompare(a.start));

  const window = timesheetQueryWindow(period, profile.time_zone, profile.week_starts_on);
  const jobOnly = params.scope === "job";

  const [shiftRows, capRows, breakPeriods] = await Promise.all([
    allPages<ShiftRow>((from, to) => {
      let query = supabase.from("shifts").select("id,job_id,starts_at,ends_at,hourly_rate_cents,tax_rate_basis_points,deductions_snapshot,jobs!inner(name,color)")
        .eq("user_id", profile.id).is("jobs.archived_at", null)
        .lt("starts_at", window.periodEnd.toISOString()).gt("ends_at", window.periodStart.toISOString());
      if (jobOnly) query = query.eq("job_id", chosen.row.id);
      return query.order("starts_at").order("id").range(from, to);
    }),
    allPages<CapRow>((from, to) => {
      let query = supabase.from("shifts").select("id,starts_at,ends_at")
        .eq("user_id", profile.id)
        .lt("starts_at", window.weeksEnd.toISOString()).gt("ends_at", window.weeksStart.toISOString());
      if (jobOnly) query = query.eq("job_id", chosen.row.id);
      return query.order("starts_at").order("id").range(from, to);
    }),
    jobOnly ? [] : allPages<BreakPeriod>((from, to) => supabase.from("break_periods")
      .select("id,start_date,end_date,weekly_limit_minutes,label").eq("user_id", profile.id)
      .lte("start_date", window.lastWeekDate).gte("end_date", window.firstWeekDate)
      .order("start_date").order("id").range(from, to)),
  ]);

  const shifts: TimesheetShift[] = shiftRows.map((row) => ({
    id: row.id,
    jobId: row.job_id,
    jobName: row.jobs.name,
    jobColor: row.jobs.color,
    startsAt: new Date(row.starts_at),
    endsAt: new Date(row.ends_at),
    hourlyRateCents: row.hourly_rate_cents,
    taxRateBasisPoints: row.tax_rate_basis_points,
    deductions: Array.isArray(row.deductions_snapshot) ? row.deductions_snapshot : [],
  }));
  const capShifts: CapShift[] = capRows.map((row) => ({ id: row.id, startsAt: new Date(row.starts_at), endsAt: new Date(row.ends_at) }));

  const sheet = buildTimesheet({
    period,
    shifts,
    capShifts,
    now,
    timeZone: profile.time_zone,
    weekStartsOn: profile.week_starts_on,
    limitMinutes: jobOnly ? chosen.row.weekly_limit_minutes : profile.global_weekly_limit_minutes,
    limitLabel: jobOnly ? `${chosen.row.name}: ` : "",
    breakPeriods,
  });

  return {
    jobs,
    selected: { id: chosen.row.id, name: chosen.row.name, color: chosen.row.color, scheduleLabel: describePaySchedule(chosen.schedule), weeklyLimitMinutes: chosen.row.weekly_limit_minutes },
    periods,
    today,
    scope: params.scope,
    sheet,
  };
}
