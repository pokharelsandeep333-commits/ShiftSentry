import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { z } from "zod";
import { breakPeriodForWeek, type BreakPeriod } from "@/lib/break-periods";
import { csvDocument, csvRow } from "@/lib/csv";
import { addDays, formatPayDay, formatPayPeriod, isCalendarDate, lastDayOf, payPeriodFor, type PayPeriod, type PaySchedule } from "@/lib/pay-period";
import { addWorkedMinutes, createTotals, type TotalsAccumulator, type WorkedShift } from "@/lib/period-totals";
import { allocateShiftMinutes, weekEndFor, weekStartFor } from "@/lib/time";
import type { EarningsSummary } from "@/lib/types";
import { formatMinutes } from "@/lib/utils";

/**
 * A pay-period timesheet: every shift slice in one pay period, grouped by local
 * day, with per-job and whole-period totals, and each week the period touches
 * checked against a weekly cap.
 *
 * Money only ever comes out of `addWorkedMinutes` (period-totals.ts), one call
 * per local-day slice, so a timesheet that lines up with the pay-period history,
 * a week or a month agrees with it to the cent. Worked time is clipped at `now`;
 * whatever of a shift lies after `now` is "scheduled", the same split
 * `summarizePayHistory` makes.
 *
 * The week check mirrors `enforce_shift_weekly_limits` rather than the money:
 * each shift's minutes inside a whole user-local week, rounded per shift, every
 * shift counted (planned ones too, as the trigger counts them), including days
 * of the week that fall outside the pay period. A week split across two pay
 * periods is therefore judged on its full total, never on the half that happens
 * to be in this period. Over means *more than* the cap; reaching it exactly is
 * allowed, as the trigger allows it.
 */

export type TimesheetScope = "all" | "job";
export const TIMESHEET_SCOPES: readonly TimesheetScope[] = ["all", "job"];

/**
 * The address's choices, validated. Anything malformed falls back to the
 * default rather than erroring: a hand-edited link still opens a timesheet.
 * `start` may be any date; it snaps to the period that holds it.
 */
const timesheetParamsSchema = z.object({
  job: z.string().uuid().optional().catch(undefined),
  start: z.string().refine(isCalendarDate).optional().catch(undefined),
  scope: z.enum(TIMESHEET_SCOPES as [TimesheetScope, ...TimesheetScope[]]).optional().catch(undefined),
});

export type TimesheetParams = { job?: string; start?: string; scope: TimesheetScope };

export function readTimesheetParams(read: (name: string) => string | null | undefined): TimesheetParams {
  const parsed = timesheetParamsSchema.parse({ job: read("job") ?? undefined, start: read("start") ?? undefined, scope: read("scope") ?? undefined });
  return { job: parsed.job, start: parsed.start, scope: parsed.scope ?? "all" };
}

export function timesheetHref(base: "/pay-periods/timesheet" | "/pay-periods/timesheet/export", params: { job: string; start: string; scope: TimesheetScope }) {
  const search = new URLSearchParams({ job: params.job, start: params.start });
  if (params.scope !== "all") search.set("scope", params.scope);
  return `${base}?${search}`;
}

/** A valid URL date can still resolve to a period outside the supported calendar. */
export function timesheetPeriodFor(requestedDay: string | undefined, today: string, schedule: PaySchedule) {
  if (requestedDay) {
    const period = payPeriodFor(requestedDay, schedule);
    // The adjacent cap weeks also need to fit the four-digit calendar.
    if (isCalendarDate(period.start) && isCalendarDate(period.end)
      && period.start >= "0001-01-07" && period.end <= "9999-12-25"
      && period.start <= requestedDay && requestedDay < period.end) return period;
  }
  return payPeriodFor(today, schedule);
}

/** A row shift: a `WorkedShift` with its id, so a shift split at midnight can be followed across days. */
export type TimesheetShift = WorkedShift & { id: string };

/** Any shift, of any job (archived ones included), for the week check only. */
export type CapShift = { id: string; startsAt: Date; endsAt: Date };

export type TimesheetAmount = { minutes: number; earnings: EarningsSummary };

export type TimesheetEntry = {
  shiftId: string;
  jobId: string;
  jobName: string;
  jobColor: string;
  date: string;
  /** This day's part of the shift, as instants. */
  startsAt: Date;
  endsAt: Date;
  endsAtNextMidnight: boolean;
  continuesFromPreviousDay: boolean;
  continuesNextDay: boolean;
  status: "worked" | "in_progress" | "scheduled";
  hourlyRateCents: number;
  worked: TimesheetAmount;
  scheduled: TimesheetAmount;
};

export type TimesheetDay = { date: string; entries: TimesheetEntry[]; worked: TimesheetAmount; scheduled: TimesheetAmount };

export type TimesheetJob = { id: string; name: string; color: string; hourlyRatesCents: number[]; worked: TimesheetAmount; scheduled: TimesheetAmount };

export type TimesheetWeek = {
  /** Local dates, half-open like a pay period. */
  start: string;
  end: string;
  /** Every counted shift's minutes in the whole week: the cap's basis. */
  minutes: number;
  /** The part of `minutes` on days inside this pay period. */
  inPeriodMinutes: number;
  /** The week reaches past the pay period on either side. */
  extendsOutsidePeriod: boolean;
  /** The week has not ended yet, so its total includes planned time. */
  provisional: boolean;
  /** The week has begun; a provisional week that has not is entirely planned. */
  started: boolean;
  limitMinutes: number | null;
  breakCap: boolean;
  over: boolean;
};

export type TimesheetVerdict = {
  kind: "no_cap" | "under" | "at_cap" | "over";
  /** Shared limit when every week has the same cap. */
  limitMinutes: number | null;
  limitsVary: boolean;
  /** The busiest week, by its cap total. */
  peakMinutes: number;
  peakWeekStart: string | null;
  overWeeks: number;
  provisional: boolean;
  headline: string;
  detail: string;
};

export type Timesheet = {
  period: PayPeriod;
  days: TimesheetDay[];
  jobs: TimesheetJob[];
  weeks: TimesheetWeek[];
  worked: TimesheetAmount;
  scheduled: TimesheetAmount;
  verdict: TimesheetVerdict;
};

function amountOf(totals: TotalsAccumulator): TimesheetAmount {
  return { minutes: totals.minutes, earnings: { ...totals.earnings } };
}

function localMidnight(day: string, timeZone: string) {
  return fromZonedTime(`${day}T00:00:00`, timeZone);
}

/** A shift's minutes inside [start, end), rounded per shift, as the weekly-limit trigger rounds them. */
function minutesWithin(shift: { startsAt: Date; endsAt: Date }, start: Date, end: Date) {
  const from = Math.max(shift.startsAt.getTime(), start.getTime());
  const to = Math.min(shift.endsAt.getTime(), end.getTime());
  return to > from ? Math.round((to - from) / 60_000) : 0;
}

/**
 * The weeks a period touches, as instants and local dates. Boundaries come from
 * `weekStartFor` / `weekEndFor`, the expression CLAUDE.md requires to match the
 * trigger's, so a timesheet week is exactly the week the cap was enforced on.
 */
export function weeksTouching(period: PayPeriod, timeZone: string, weekStartsOn: number) {
  const weeks: { start: string; end: string; startsAt: Date; endsAt: Date }[] = [];
  // A skipped midnight may convert to the previous date. Find the first week from noon.
  let cursor = weekStartFor(fromZonedTime(`${period.start}T12:00:00`, timeZone), timeZone, weekStartsOn);
  let start = formatInTimeZone(cursor, timeZone, "yyyy-MM-dd");
  while (start < period.end) {
    const next = weekEndFor(cursor, timeZone, weekStartsOn);
    const end = formatInTimeZone(next, timeZone, "yyyy-MM-dd");
    weeks.push({ start, end, startsAt: cursor, endsAt: next });
    cursor = next;
    start = end;
  }
  return weeks;
}

/** The instants a timesheet must read: the period, widened to whole weeks for the cap check. */
export function timesheetQueryWindow(period: PayPeriod, timeZone: string, weekStartsOn: number) {
  const weeks = weeksTouching(period, timeZone, weekStartsOn);
  return {
    periodStart: localMidnight(period.start, timeZone),
    periodEnd: localMidnight(period.end, timeZone),
    weeksStart: weeks[0].startsAt,
    weeksEnd: weeks[weeks.length - 1].endsAt,
    firstWeekDate: weeks[0].start,
    lastWeekDate: weeks[weeks.length - 1].start,
  };
}

export function buildTimesheet({ period, shifts, capShifts, now, timeZone, weekStartsOn, limitMinutes, limitLabel = "", breakPeriods = [] }: {
  period: PayPeriod;
  /** Shifts shown as rows: active jobs only, as everywhere else. */
  shifts: TimesheetShift[];
  /** Shifts counted toward the cap: every job in scope, archived ones too, as the trigger counts them. */
  capShifts: CapShift[];
  now: Date;
  timeZone: string;
  weekStartsOn: number;
  limitMinutes: number | null;
  /** Prefix for the verdict when the cap is not the overall one, e.g. "Library: ". */
  limitLabel?: string;
  /** Only the overall cap can be replaced by a break period. */
  breakPeriods?: readonly BreakPeriod[];
}): Timesheet {
  const within = (day: string) => day >= period.start && day < period.end;
  type EntryAcc = Omit<TimesheetEntry, "worked" | "scheduled"> & { worked: TotalsAccumulator; scheduled: TotalsAccumulator };
  const entries = new Map<string, EntryAcc>();
  const days = new Map<string, { worked: TotalsAccumulator; scheduled: TotalsAccumulator }>();
  const jobs = new Map<string, { id: string; name: string; color: string; rates: Set<number>; worked: TotalsAccumulator; scheduled: TotalsAccumulator }>();
  const worked = createTotals();
  const scheduled = createTotals();

  for (const shift of [...shifts].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.jobName.localeCompare(b.jobName))) {
    const jobRef = { id: shift.jobId, name: shift.jobName, color: shift.jobColor };
    const firstDay = formatInTimeZone(shift.startsAt, timeZone, "yyyy-MM-dd");
    const lastDay = formatInTimeZone(new Date(shift.endsAt.getTime() - 1), timeZone, "yyyy-MM-dd");

    const entryFor = (date: string) => {
      const key = `${shift.id}|${date}`;
      let entry = entries.get(key);
      if (!entry) {
        const dayStart = localMidnight(date, timeZone);
        const dayEnd = localMidnight(addDays(date, 1), timeZone);
        const startsAt = shift.startsAt > dayStart ? shift.startsAt : dayStart;
        const endsAt = shift.endsAt < dayEnd ? shift.endsAt : dayEnd;
        entry = {
          shiftId: shift.id, jobId: shift.jobId, jobName: shift.jobName, jobColor: shift.jobColor, date,
          startsAt, endsAt,
          endsAtNextMidnight: endsAt.getTime() === dayEnd.getTime(),
          continuesFromPreviousDay: date > firstDay,
          continuesNextDay: date < lastDay,
          status: endsAt <= now ? "worked" : startsAt < now ? "in_progress" : "scheduled",
          hourlyRateCents: shift.hourlyRateCents, worked: createTotals(), scheduled: createTotals(),
        };
        entries.set(key, entry);
      }
      return entry;
    };
    const add = (part: "worked" | "scheduled", from: Date, to: Date) => {
      for (const slice of allocateShiftMinutes(from, to, timeZone)) {
        if (!within(slice.date) || slice.minutes === 0) continue;
        const day = days.get(slice.date) ?? { worked: createTotals(), scheduled: createTotals() };
        days.set(slice.date, day);
        const job = jobs.get(shift.jobId) ?? { ...jobRef, rates: new Set<number>(), worked: createTotals(), scheduled: createTotals() };
        jobs.set(shift.jobId, job);
        job.rates.add(shift.hourlyRateCents);
        for (const totals of [entryFor(slice.date)[part], day[part], job[part], part === "worked" ? worked : scheduled]) {
          addWorkedMinutes(totals, slice.minutes, jobRef, shift);
        }
      }
    };

    if (shift.startsAt < now) add("worked", shift.startsAt, shift.endsAt < now ? shift.endsAt : now);
    if (shift.endsAt > now) add("scheduled", shift.startsAt > now ? shift.startsAt : now, shift.endsAt);
  }

  const dayList: TimesheetDay[] = Array.from(days.entries()).sort(([a], [b]) => a.localeCompare(b)).map(([date, totals]) => ({
    date,
    entries: Array.from(entries.values()).filter((entry) => entry.date === date)
      .sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())
      .map((entry) => ({ ...entry, worked: amountOf(entry.worked), scheduled: amountOf(entry.scheduled) })),
    worked: amountOf(totals.worked),
    scheduled: amountOf(totals.scheduled),
  }));

  const jobList: TimesheetJob[] = Array.from(jobs.values())
    .map((job) => ({ id: job.id, name: job.name, color: job.color, hourlyRatesCents: Array.from(job.rates).sort((a, b) => a - b), worked: amountOf(job.worked), scheduled: amountOf(job.scheduled) }))
    .sort((a, b) => b.worked.minutes + b.scheduled.minutes - (a.worked.minutes + a.scheduled.minutes) || a.name.localeCompare(b.name));

  const periodStart = localMidnight(period.start, timeZone);
  const periodEnd = localMidnight(period.end, timeZone);
  const weeks: TimesheetWeek[] = weeksTouching(period, timeZone, weekStartsOn).map((week) => {
    let minutes = 0;
    let inPeriodMinutes = 0;
    const inStart = week.startsAt > periodStart ? week.startsAt : periodStart;
    const inEnd = week.endsAt < periodEnd ? week.endsAt : periodEnd;
    for (const shift of capShifts) {
      minutes += minutesWithin(shift, week.startsAt, week.endsAt);
      inPeriodMinutes += minutesWithin(shift, inStart, inEnd);
    }
    const breakPeriod = breakPeriodForWeek(breakPeriods, week.start);
    const weekLimit = breakPeriod?.weekly_limit_minutes ?? limitMinutes;
    return {
      start: week.start,
      end: week.end,
      minutes,
      inPeriodMinutes,
      extendsOutsidePeriod: week.start < period.start || week.end > period.end,
      provisional: week.endsAt > now,
      started: week.startsAt <= now,
      limitMinutes: weekLimit,
      breakCap: breakPeriod !== null,
      over: weekLimit !== null && minutes > weekLimit,
    };
  });

  return {
    period,
    days: dayList,
    jobs: jobList,
    weeks,
    worked: amountOf(worked),
    scheduled: amountOf(scheduled),
    verdict: weeklyVerdict(weeks, limitLabel),
  };
}

/** "20h", "19.5h": decimal hours for prose and files, never for money. */
export function decimalHours(minutes: number) {
  const hours = Math.round((minutes / 60) * 100) / 100;
  return `${Number.isInteger(hours) ? hours : hours.toFixed(2).replace(/0$/, "")}h`;
}

/**
 * The one-line answer to "did I stay under my cap?", and the sentence under it.
 * A week still in progress counts its planned shifts, as the trigger does, so
 * the answer for a current period reads as a forecast, not a record.
 */
function weeklyVerdict(weeks: TimesheetWeek[], limitLabel: string): TimesheetVerdict {
  const peak = weeks.reduce<TimesheetWeek | null>((best, week) => (!best || week.minutes > best.minutes ? week : best), null);
  const peakMinutes = peak?.minutes ?? 0;
  const peakWeekStart = peak && peak.minutes > 0 ? peak.start : null;
  const overWeeks = weeks.filter((week) => week.over).length;
  const provisional = weeks.some((week) => week.provisional);
  const capped = weeks.filter((week) => week.limitMinutes !== null);
  const limitsVary = new Set(weeks.map((week) => week.limitMinutes)).size > 1;
  const limitMinutes = limitsVary ? null : capped[0]?.limitMinutes ?? null;
  const peakText = peakWeekStart ? `Busiest week: ${formatMinutes(peakMinutes)}, week of ${formatPayDay(peakWeekStart)}.` : "No hours in any of these weeks.";
  const planned = provisional ? " Weeks that haven't ended include planned shifts." : "";
  const varying = limitsVary ? " The table shows the cap that applies to each week." : "";
  const base = { limitMinutes, limitsVary, peakMinutes, peakWeekStart, overWeeks, provisional };

  if (capped.length === 0) {
    return { ...base, kind: "no_cap", headline: `${limitLabel}No weekly cap set`, detail: `${peakText}${planned}` };
  }
  const cap = limitMinutes === null ? "the cap" : decimalHours(limitMinutes);
  const weekWord = (count: number) => `${count} ${count === 1 ? "week" : "weeks"}`;
  if (overWeeks > 0) {
    return { ...base, kind: "over", headline: `${limitLabel}Over ${cap} in ${overWeeks} of ${weekWord(capped.length)}${capped.length < weeks.length ? " with a cap" : ""}`, detail: `${peakText}${varying}${planned}` };
  }
  const lead = provisional ? "On track to stay" : "Stayed";
  const whichWeeks = capped.length < weeks.length ? " in weeks with a cap" : " each week";
  if (capped.some((week) => week.minutes === week.limitMinutes)) {
    return { ...base, kind: "at_cap", headline: `${limitLabel}${lead} within ${cap}${whichWeeks}`, detail: `${peakText}${varying} Reaching the cap exactly is allowed.${planned}` };
  }
  return { ...base, kind: "under", headline: `${limitLabel}${lead} under ${cap}${whichWeeks}`, detail: `${peakText}${varying}${planned}` };
}

/** Cents as a plain decimal for a spreadsheet: integer arithmetic, no float rounding. */
export function centsDecimal(cents: number) {
  const sign = cents < 0 ? "-" : "";
  const absolute = Math.abs(cents);
  return `${sign}${Math.floor(absolute / 100)}.${String(absolute % 100).padStart(2, "0")}`;
}

function hoursDecimal(minutes: number) {
  return (Math.round((minutes / 60) * 100) / 100).toFixed(2);
}

const STATUS_LABEL: Record<TimesheetEntry["status"], string> = { worked: "Worked", in_progress: "In progress", scheduled: "Planned" };
export function entryStatusLabel(status: TimesheetEntry["status"]) {
  return STATUS_LABEL[status];
}

/**
 * The timesheet as CSV, in sections a spreadsheet shows as a readable report:
 * the summary, one row per shift per day, day totals, job totals, and weeks.
 * Hours and money columns are plain decimals so they can be summed; money comes
 * straight from the timesheet's cents.
 */
export function timesheetCsv(sheet: Timesheet, meta: { title: string; scopeLabel: string; timeZone: string; generatedAt: Date }) {
  const time = (date: Date) => formatInTimeZone(date, meta.timeZone, "HH:mm");
  const money = (amount: TimesheetAmount) => [centsDecimal(amount.earnings.grossCents), centsDecimal(amount.earnings.taxCents), centsDecimal(amount.earnings.deductionCents), centsDecimal(amount.earnings.netCents)];
  const lines = [
    csvRow(["ShiftSentry timesheet"]),
    csvRow(["Pay period", formatPayPeriod(sheet.period, true)]),
    csvRow(["First day", sheet.period.start]),
    csvRow(["Last day", lastDayOf(sheet.period)]),
    csvRow(["Timesheet for", meta.title]),
    csvRow(["Jobs included", meta.scopeLabel]),
    csvRow(["Time zone", meta.timeZone]),
    csvRow(["Weekly cap", sheet.verdict.limitsVary ? "Varies by week" : sheet.verdict.limitMinutes === null ? "none" : hoursDecimal(sheet.verdict.limitMinutes)]),
    csvRow(["Weekly cap check", sheet.verdict.headline]),
    csvRow(["", sheet.verdict.detail]),
    csvRow(["Worked hours", hoursDecimal(sheet.worked.minutes)]),
    csvRow(["Worked net pay", centsDecimal(sheet.worked.earnings.netCents)]),
    ...(sheet.scheduled.minutes > 0 ? [csvRow(["Planned hours still to come", hoursDecimal(sheet.scheduled.minutes)])] : []),
    csvRow(["Generated", formatInTimeZone(meta.generatedAt, meta.timeZone, "yyyy-MM-dd HH:mm")]),
    csvRow(["Estimates from each shift's saved pay rate, tax rate and deductions. Pay is counted for worked time only."]),
    "",
    csvRow(["Shifts"]),
    csvRow(["date", "weekday", "job", "start", "end", "note", "status", "worked_minutes", "worked_hours", "planned_minutes", "hourly_rate", "gross", "tax", "deductions", "net"]),
    ...sheet.days.flatMap((day) => day.entries.map((entry) => csvRow([
      entry.date,
      formatInTimeZone(entry.startsAt, meta.timeZone, "EEE"),
      entry.jobName,
      time(entry.startsAt),
      entry.endsAtNextMidnight ? "24:00" : time(entry.endsAt),
      [entry.continuesFromPreviousDay && "continued from previous day", entry.continuesNextDay && "continues next day"].filter(Boolean).join("; "),
      entryStatusLabel(entry.status),
      entry.worked.minutes,
      hoursDecimal(entry.worked.minutes),
      entry.scheduled.minutes,
      centsDecimal(entry.hourlyRateCents),
      ...money(entry.worked),
    ]))),
    "",
    csvRow(["Days"]),
    csvRow(["date", "weekday", "worked_minutes", "worked_hours", "planned_minutes", "gross", "tax", "deductions", "net"]),
    ...sheet.days.map((day) => csvRow([day.date, formatPayDay(day.date, true).slice(0, 3), day.worked.minutes, hoursDecimal(day.worked.minutes), day.scheduled.minutes, ...money(day.worked)])),
    csvRow(["Total", "", sheet.worked.minutes, hoursDecimal(sheet.worked.minutes), sheet.scheduled.minutes, ...money(sheet.worked)]),
    "",
    csvRow(["Jobs"]),
    csvRow(["job", "hourly_rate", "worked_minutes", "worked_hours", "planned_minutes", "gross", "tax", "deductions", "net"]),
    ...sheet.jobs.map((job) => csvRow([job.name, job.hourlyRatesCents.map(centsDecimal).join(" / "), job.worked.minutes, hoursDecimal(job.worked.minutes), job.scheduled.minutes, ...money(job.worked)])),
    "",
    csvRow(["Weeks"]),
    csvRow(["week_start", "week_end", "total_hours", "hours_in_this_period", "weekly_cap_hours", "status"]),
    ...sheet.weeks.map((week) => csvRow([
      week.start,
      addDays(week.end, -1),
      hoursDecimal(week.minutes),
      hoursDecimal(week.inPeriodMinutes),
      week.limitMinutes === null ? "" : hoursDecimal(week.limitMinutes),
      week.limitMinutes === null ? "no cap" : week.over ? "over cap" : week.minutes === week.limitMinutes ? "at cap" : "under cap",
    ])),
  ];
  return csvDocument(lines);
}
