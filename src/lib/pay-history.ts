import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { JOB_PAY_COLUMNS, describePaySchedule, payPeriodsBack, payScheduleFromColumns, summarizePayHistory, type JobPayColumns, type PayPeriodHistoryEntry } from "@/lib/pay-period";
import type { DeductionSnapshot } from "@/lib/earnings";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/** Periods load six at a time; the cap keeps a hand-edited address from asking for decades. */
export const PAY_HISTORY_STEP = 6;
const PAY_HISTORY_MAX = 312;

export function clampPeriodCount(value: string | undefined) {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < PAY_HISTORY_STEP) return PAY_HISTORY_STEP;
  return Math.min(PAY_HISTORY_MAX, Math.ceil(parsed / PAY_HISTORY_STEP) * PAY_HISTORY_STEP);
}

export type PayHistoryJob = { id: string; name: string; color: string };
export type PayHistory = {
  jobs: PayHistoryJob[];
  job: PayHistoryJob & { scheduleLabel: string } | null;
  periods: PayPeriodHistoryEntry[];
  hasOlder: boolean;
};

type ShiftRow = { starts_at: string; ends_at: string; hourly_rate_cents: number; tax_rate_basis_points: number; deductions_snapshot: DeductionSnapshot[] };
type JobRow = JobPayColumns & { id: string; name: string; color: string };

const PAGE = 1_000;

/**
 * One job's pay periods, newest first, through the RLS client. Only active
 * jobs with a schedule are offered, as on the dashboard. Shifts are read for
 * the span the requested periods cover and paged past PostgREST's 1,000-row
 * cap; a second head-only query asks whether anything older exists, so "Load
 * older" never appears when it would do nothing.
 */
export async function getPayHistory(profile: { id: string; time_zone: string }, requestedJobId: string | undefined, count: number): Promise<PayHistory> {
  const supabase = await createServerSupabaseClient();
  const { data: jobRows, error: jobsError } = await supabase.from("jobs").select(`id,name,color,${JOB_PAY_COLUMNS}`).eq("user_id", profile.id).is("archived_at", null).order("created_at");
  if (jobsError) throw jobsError;

  const scheduled = (jobRows as JobRow[]).flatMap((row) => {
    const schedule = payScheduleFromColumns(row);
    return schedule ? [{ row, schedule }] : [];
  });
  const jobs = scheduled.map(({ row }) => ({ id: row.id, name: row.name, color: row.color }));
  const selected = scheduled.find(({ row }) => row.id === requestedJobId) ?? scheduled[0];
  if (!selected) return { jobs, job: null, periods: [], hasOlder: false };

  const now = new Date();
  const today = formatInTimeZone(now, profile.time_zone, "yyyy-MM-dd");
  const periods = payPeriodsBack(today, selected.schedule, count);
  const windowStart = fromZonedTime(`${periods[periods.length - 1].start}T00:00:00`, profile.time_zone);
  const windowEnd = fromZonedTime(`${periods[0].end}T00:00:00`, profile.time_zone);

  const rows: ShiftRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase.from("shifts").select("starts_at,ends_at,hourly_rate_cents,tax_rate_basis_points,deductions_snapshot")
      .eq("user_id", profile.id).eq("job_id", selected.row.id)
      .lt("starts_at", windowEnd.toISOString()).gt("ends_at", windowStart.toISOString())
      .order("starts_at").range(from, from + PAGE - 1);
    if (error) throw error;
    rows.push(...(data as ShiftRow[]));
    if (!data || data.length < PAGE) break;
  }
  const { count: olderCount, error: olderError } = await supabase.from("shifts").select("id", { count: "exact", head: true })
    .eq("user_id", profile.id).eq("job_id", selected.row.id).lte("ends_at", windowStart.toISOString());
  if (olderError) throw olderError;

  const job = { id: selected.row.id, name: selected.row.name, color: selected.row.color };
  return {
    jobs,
    job: { ...job, scheduleLabel: describePaySchedule(selected.schedule) },
    periods: summarizePayHistory({
      periods,
      schedule: selected.schedule,
      now,
      timeZone: profile.time_zone,
      shifts: rows.map((row) => ({
        jobId: job.id,
        jobName: job.name,
        jobColor: job.color,
        startsAt: new Date(row.starts_at),
        endsAt: new Date(row.ends_at),
        hourlyRateCents: row.hourly_rate_cents,
        taxRateBasisPoints: row.tax_rate_basis_points,
        deductions: Array.isArray(row.deductions_snapshot) ? row.deductions_snapshot : [],
      })),
    }),
    hasOlder: (olderCount ?? 0) > 0 && count < PAY_HISTORY_MAX,
  };
}
