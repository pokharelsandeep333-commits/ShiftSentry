import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { addWorkedMinutes, createTotals, type TotalsAccumulator, type WorkedShift } from "@/lib/period-totals";
import { allocateShiftMinutes } from "@/lib/time";

/**
 * A job's pay schedule, as stored on `jobs` (20261015120000_job_pay_schedules).
 *
 * The schedule is a rule, and every period is derived from it here. A period is
 * a half-open run of the viewer's *local* dates, `[start, end)`: a biweekly
 * Thursday payroll is Thu Oct 15 up to but not including Thu Oct 29, so the
 * boundary Thursday belongs to exactly one period. Shown to people, the end is
 * the last day inside (`lastDayOf`), because "Oct 15 - Oct 28" is how a paystub
 * reads.
 *
 * Every date is a `YYYY-MM-DD` string and all arithmetic is done at UTC noon,
 * the same trick `time.ts` and `calendar-range.ts` use, so neither a DST change
 * nor the server's own zone can move a boundary by a day.
 */
export type PaySchedule =
  | { kind: "every_n_weeks"; intervalWeeks: number; anchorDate: string; paydayOffsetDays: number | null }
  | { kind: "monthly_day"; monthDay: number; paydayOffsetDays: number | null };

export type PayPeriod = { start: string; end: string };

/** The job columns a schedule is read from. */
export type JobPayColumns = {
  pay_schedule: string;
  pay_interval_weeks: number | null;
  pay_anchor_date: string | null;
  pay_month_day: number | null;
  payday_offset_days: number | null;
};

export const JOB_PAY_COLUMNS = "pay_schedule,pay_interval_weeks,pay_anchor_date,pay_month_day,payday_offset_days";

/**
 * The frequency picker's choices. Interval and kind are one choice rather than
 * two, because "every 3 weeks" is how a person says it; the form's value maps
 * onto the columns in `payScheduleFormSchema` (validation.ts).
 */
export const PAY_FREQUENCIES = ["none", "1w", "2w", "3w", "4w", "monthly"] as const;
export type PayFrequency = typeof PAY_FREQUENCIES[number];

export const PAY_FREQUENCY_OPTIONS: { value: PayFrequency; label: string }[] = [
  { value: "none", label: "No pay schedule" },
  { value: "1w", label: "Every week" },
  { value: "2w", label: "Every 2 weeks" },
  { value: "3w", label: "Every 3 weeks" },
  { value: "4w", label: "Every 4 weeks" },
  { value: "monthly", label: "Monthly, on a set day" },
];

export function payFrequencyOf(schedule: PaySchedule | null): PayFrequency {
  if (!schedule) return "none";
  return schedule.kind === "monthly_day" ? "monthly" : `${schedule.intervalWeeks}w` as PayFrequency;
}

const DAY_MS = 86_400_000;

function noon(day: string) {
  return Date.parse(`${day}T12:00:00Z`);
}

function dayString(ms: number) {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(day: string, days: number) {
  return dayString(noon(day) + days * DAY_MS);
}

/** Whole local days from `from` to `to`; negative when `to` is earlier. */
export function daysBetween(from: string, to: string) {
  return Math.round((noon(to) - noon(from)) / DAY_MS);
}

export function isCalendarDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(noon(value)) && dayString(noon(value)) === value;
}

/**
 * Day `monthDay` of a month, or that month's last day when it is shorter.
 * `month` is 1-based and may run past either end of the year.
 */
function cycleDay(year: number, month: number, monthDay: number) {
  const first = new Date(Date.UTC(year, month - 1, 1, 12));
  const y = first.getUTCFullYear();
  const m = first.getUTCMonth() + 1;
  const lastDay = new Date(Date.UTC(y, m, 0, 12)).getUTCDate();
  return `${String(y).padStart(4, "0")}-${String(m).padStart(2, "0")}-${String(Math.min(monthDay, lastDay)).padStart(2, "0")}`;
}

export function payScheduleFromColumns(row: JobPayColumns): PaySchedule | null {
  const paydayOffsetDays = row.payday_offset_days ?? null;
  if (row.pay_schedule === "every_n_weeks" && row.pay_interval_weeks && row.pay_anchor_date) {
    return { kind: "every_n_weeks", intervalWeeks: row.pay_interval_weeks, anchorDate: row.pay_anchor_date, paydayOffsetDays };
  }
  if (row.pay_schedule === "monthly_day" && row.pay_month_day) {
    return { kind: "monthly_day", monthDay: row.pay_month_day, paydayOffsetDays };
  }
  return null;
}

/** The pay period a local date falls in. */
export function payPeriodFor(day: string, schedule: PaySchedule): PayPeriod {
  if (schedule.kind === "every_n_weeks") {
    const length = schedule.intervalWeeks * 7;
    // Floor, not truncation, so a date before the anchor lands in the period
    // that ends on it rather than the one that starts there.
    const index = Math.floor(daysBetween(schedule.anchorDate, day) / length);
    const start = addDays(schedule.anchorDate, index * length);
    return { start, end: addDays(start, length) };
  }

  const year = Number(day.slice(0, 4));
  const month = Number(day.slice(5, 7));
  const thisMonth = cycleDay(year, month, schedule.monthDay);
  const start = day >= thisMonth ? thisMonth : cycleDay(year, month - 1, schedule.monthDay);
  // The end is built the same way as the next start, so consecutive periods
  // always meet exactly, even when one month clamps and the next does not.
  return { start, end: cycleDay(Number(start.slice(0, 4)), Number(start.slice(5, 7)) + 1, schedule.monthDay) };
}

export function previousPayPeriod(period: PayPeriod, schedule: PaySchedule) {
  return payPeriodFor(addDays(period.start, -1), schedule);
}

export function lastDayOf(period: PayPeriod) {
  return addDays(period.end, -1);
}

/** The estimated payday, when the job says how long after a period it pays. */
export function paydayFor(period: PayPeriod, schedule: PaySchedule) {
  return schedule.paydayOffsetDays === null ? null : addDays(lastDayOf(period), schedule.paydayOffsetDays);
}

/**
 * How far either side of today the dashboard's shift query must reach for the
 * current and previous periods of any valid schedule. A monthly period is at
 * most 31 days and a weekly one at most 28, so the current period ends within
 * 31 days of today and the previous one starts within 62 days before it; one
 * spare day each way. `pay-period.test.ts` sweeps every schedule against these.
 */
export const PAY_PERIOD_LOOKBACK_DAYS = 63;
export const PAY_PERIOD_LOOKAHEAD_DAYS = 32;

export function payPeriodQueryWindow(now: Date, timeZone: string) {
  const today = formatInTimeZone(now, timeZone, "yyyy-MM-dd");
  return {
    start: fromZonedTime(`${addDays(today, -PAY_PERIOD_LOOKBACK_DAYS)}T00:00:00`, timeZone),
    end: fromZonedTime(`${addDays(today, PAY_PERIOD_LOOKAHEAD_DAYS)}T00:00:00`, timeZone),
  };
}

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

function ordinal(value: number) {
  const tens = value % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : ["th", "st", "nd", "rd"][value % 10] ?? "th";
  return `${value}${suffix}`;
}

/** "Every 2 weeks from Thursday", "Monthly from the 21st". */
export function describePaySchedule(schedule: PaySchedule) {
  if (schedule.kind === "monthly_day") {
    return `Monthly from the ${ordinal(schedule.monthDay)}${schedule.monthDay > 28 ? " (or the month's last day)" : ""}`;
  }
  const weekday = WEEKDAYS[new Date(noon(schedule.anchorDate)).getUTCDay()];
  return `${schedule.intervalWeeks === 1 ? "Every week" : `Every ${schedule.intervalWeeks} weeks`} from ${weekday}`;
}

const SHORT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const SHORT_WITH_YEAR = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const WITH_WEEKDAY = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", timeZone: "UTC" });

export function formatPayDay(day: string, withWeekday = false) {
  return (withWeekday ? WITH_WEEKDAY : SHORT).format(noon(day));
}

/** "Oct 15 – Oct 28", with years only when the period crosses one. */
export function formatPayPeriod(period: PayPeriod) {
  const last = lastDayOf(period);
  const format = period.start.slice(0, 4) === last.slice(0, 4) ? SHORT : SHORT_WITH_YEAR;
  return `${format.format(noon(period.start))} – ${format.format(noon(last))}`;
}

export type PayPeriodAmount = { minutes: number; grossCents: number; netCents: number };

export type PayPeriodSummary = {
  jobId: string;
  jobName: string;
  jobColor: string;
  scheduleLabel: string;
  current: PayPeriod & {
    /** Today included, so the last day of a period reads "1 day left". */
    daysLeft: number;
    payday: string | null;
    worked: PayPeriodAmount;
    scheduled: PayPeriodAmount;
  };
  previous: PayPeriod & { payday: string | null; worked: PayPeriodAmount };
};

function amountOf(totals: TotalsAccumulator): PayPeriodAmount {
  return { minutes: totals.minutes, grossCents: totals.earnings.grossCents, netCents: totals.earnings.netCents };
}

function within(day: string, period: PayPeriod) {
  return day >= period.start && day < period.end;
}

/**
 * The current and previous pay period of every job that has a schedule.
 *
 * Shifts are split at local midnights and money is added per slice through
 * `addWorkedMinutes`, exactly as every other total is built (period-totals.ts),
 * so a period that lines up with a month or a week agrees with it to the cent.
 * "Worked" is clipped at `now`; whatever of a shift lies after `now` is
 * "scheduled", which is how an in-progress shift ends up split across both.
 * Periods are per job because two jobs' periods do not line up and a combined
 * figure would describe no paycheck anyone receives.
 */
export function summarizePayPeriods({ jobs, shifts, now, timeZone }: {
  jobs: { id: string; name: string; color: string; schedule: PaySchedule | null }[];
  shifts: WorkedShift[];
  now: Date;
  timeZone: string;
}): PayPeriodSummary[] {
  const today = formatInTimeZone(now, timeZone, "yyyy-MM-dd");
  const tracked = new Map(jobs.flatMap((job) => {
    if (!job.schedule) return [];
    const current = payPeriodFor(today, job.schedule);
    const previous = previousPayPeriod(current, job.schedule);
    return [[job.id, { job, schedule: job.schedule, current, previous, worked: createTotals(), scheduled: createTotals(), previousWorked: createTotals() }] as const];
  }));

  for (const shift of shifts) {
    const entry = tracked.get(shift.jobId);
    if (!entry) continue;
    const jobRef = { id: shift.jobId, name: shift.jobName, color: shift.jobColor };
    if (shift.startsAt < now) {
      const workedEnd = shift.endsAt < now ? shift.endsAt : now;
      for (const slice of allocateShiftMinutes(shift.startsAt, workedEnd, timeZone)) {
        if (within(slice.date, entry.current)) addWorkedMinutes(entry.worked, slice.minutes, jobRef, shift);
        else if (within(slice.date, entry.previous)) addWorkedMinutes(entry.previousWorked, slice.minutes, jobRef, shift);
      }
    }
    if (shift.endsAt > now) {
      const scheduledStart = shift.startsAt > now ? shift.startsAt : now;
      for (const slice of allocateShiftMinutes(scheduledStart, shift.endsAt, timeZone)) {
        if (within(slice.date, entry.current)) addWorkedMinutes(entry.scheduled, slice.minutes, jobRef, shift);
      }
    }
  }

  return Array.from(tracked.values()).map(({ job, schedule, current, previous, worked, scheduled, previousWorked }) => ({
    jobId: job.id,
    jobName: job.name,
    jobColor: job.color,
    scheduleLabel: describePaySchedule(schedule),
    current: { ...current, daysLeft: daysBetween(today, current.end), payday: paydayFor(current, schedule), worked: amountOf(worked), scheduled: amountOf(scheduled) },
    previous: { ...previous, payday: paydayFor(previous, schedule), worked: amountOf(previousWorked) },
  }));
}
