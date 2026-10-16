import assert from "node:assert/strict";
import test from "node:test";
import {
  PAY_PERIOD_LOOKAHEAD_DAYS, PAY_PERIOD_LOOKBACK_DAYS, addDays, describePaySchedule, formatPayPeriod, lastDayOf,
  payFrequencyOf, payPeriodFor, payScheduleFromColumns, paydayFor, previousPayPeriod, summarizePayPeriods, type PaySchedule,
} from "./pay-period";
import type { WorkedShift } from "./period-totals";

const BIWEEKLY_THURSDAY: PaySchedule = { kind: "every_n_weeks", intervalWeeks: 2, anchorDate: "2026-10-15", paydayOffsetDays: null };
const MONTHLY_21ST: PaySchedule = { kind: "monthly_day", monthDay: 21, paydayOffsetDays: null };

test("biweekly: a period runs Thursday up to, not including, the Thursday two weeks on", () => {
  assert.deepEqual(payPeriodFor("2026-10-15", BIWEEKLY_THURSDAY), { start: "2026-10-15", end: "2026-10-29" });
  assert.deepEqual(payPeriodFor("2026-10-28", BIWEEKLY_THURSDAY), { start: "2026-10-15", end: "2026-10-29" });
  // The boundary Thursday starts the next period and is never in two.
  assert.deepEqual(payPeriodFor("2026-10-29", BIWEEKLY_THURSDAY), { start: "2026-10-29", end: "2026-11-12" });
  assert.equal(lastDayOf(payPeriodFor("2026-10-20", BIWEEKLY_THURSDAY)), "2026-10-28");
});

test("biweekly: the anchor only fixes the phase, so dates long before it still land on the right Thursdays", () => {
  assert.deepEqual(payPeriodFor("2026-10-14", BIWEEKLY_THURSDAY), { start: "2026-10-01", end: "2026-10-15" });
  assert.deepEqual(payPeriodFor("2025-12-31", BIWEEKLY_THURSDAY), { start: "2025-12-25", end: "2026-01-08" });
  // Any period start works as the anchor and gives the same periods.
  const laterAnchor: PaySchedule = { ...BIWEEKLY_THURSDAY, anchorDate: "2027-03-04" };
  for (let offset = -400; offset <= 400; offset += 7) {
    const day = addDays("2026-10-15", offset);
    assert.deepEqual(payPeriodFor(day, laterAnchor), payPeriodFor(day, BIWEEKLY_THURSDAY), day);
  }
});

test("weekly and four-weekly intervals", () => {
  const weekly: PaySchedule = { kind: "every_n_weeks", intervalWeeks: 1, anchorDate: "2026-10-12", paydayOffsetDays: null };
  assert.deepEqual(payPeriodFor("2026-10-18", weekly), { start: "2026-10-12", end: "2026-10-19" });
  const fourWeekly: PaySchedule = { ...weekly, intervalWeeks: 4 };
  assert.deepEqual(payPeriodFor("2026-11-08", fourWeekly), { start: "2026-10-12", end: "2026-11-09" });
});

test("monthly: the 21st up to the 21st of the next month", () => {
  assert.deepEqual(payPeriodFor("2026-10-21", MONTHLY_21ST), { start: "2026-10-21", end: "2026-11-21" });
  assert.deepEqual(payPeriodFor("2026-10-20", MONTHLY_21ST), { start: "2026-09-21", end: "2026-10-21" });
  assert.deepEqual(payPeriodFor("2026-10-15", MONTHLY_21ST), { start: "2026-09-21", end: "2026-10-21" });
  // Across a year end.
  assert.deepEqual(payPeriodFor("2027-01-05", MONTHLY_21ST), { start: "2026-12-21", end: "2027-01-21" });
  assert.equal(formatPayPeriod(payPeriodFor("2027-01-05", MONTHLY_21ST)), "Dec 21, 2026 – Jan 20, 2027");
  assert.equal(formatPayPeriod(payPeriodFor("2026-10-15", MONTHLY_21ST)), "Sep 21 – Oct 20");
});

test("monthly: a day past a short month's end falls back to its last day, and periods still meet", () => {
  const monthEnd: PaySchedule = { kind: "monthly_day", monthDay: 31, paydayOffsetDays: null };
  assert.deepEqual(payPeriodFor("2027-02-15", monthEnd), { start: "2027-01-31", end: "2027-02-28" });
  assert.deepEqual(payPeriodFor("2027-03-30", monthEnd), { start: "2027-02-28", end: "2027-03-31" });
  assert.deepEqual(payPeriodFor("2028-02-29", monthEnd), { start: "2028-02-29", end: "2028-03-31" });
  const day30: PaySchedule = { kind: "monthly_day", monthDay: 30, paydayOffsetDays: null };
  assert.deepEqual(payPeriodFor("2027-03-01", day30), { start: "2027-02-28", end: "2027-03-30" });
});

test("every schedule tiles the calendar: each day is in one period and periods meet end to start", () => {
  const schedules: PaySchedule[] = [
    BIWEEKLY_THURSDAY,
    { kind: "every_n_weeks", intervalWeeks: 1, anchorDate: "2026-01-04", paydayOffsetDays: null },
    { kind: "every_n_weeks", intervalWeeks: 3, anchorDate: "2026-05-05", paydayOffsetDays: null },
    { kind: "every_n_weeks", intervalWeeks: 4, anchorDate: "2026-02-27", paydayOffsetDays: null },
    ...[1, 15, 21, 28, 29, 30, 31].map((monthDay): PaySchedule => ({ kind: "monthly_day", monthDay, paydayOffsetDays: null })),
  ];
  for (const schedule of schedules) {
    let period = payPeriodFor("2026-01-01", schedule);
    for (let index = 0; index < 40; index += 1) {
      const next = payPeriodFor(period.end, schedule);
      assert.equal(next.start, period.end, `${describePaySchedule(schedule)} after ${period.start}`);
      assert.deepEqual(payPeriodFor(lastDayOf(period), schedule), period);
      assert.deepEqual(previousPayPeriod(next, schedule), period);
      period = next;
    }
  }
});

test("the dashboard query window covers the current and previous period of any schedule", () => {
  const schedules: PaySchedule[] = [
    ...[1, 2, 3, 4].map((intervalWeeks): PaySchedule => ({ kind: "every_n_weeks", intervalWeeks, anchorDate: "2026-03-05", paydayOffsetDays: null })),
    ...Array.from({ length: 31 }, (_, index): PaySchedule => ({ kind: "monthly_day", monthDay: index + 1, paydayOffsetDays: null })),
  ];
  for (let offset = 0; offset < 800; offset += 1) {
    const today = addDays("2026-01-01", offset);
    for (const schedule of schedules) {
      const current = payPeriodFor(today, schedule);
      const previous = previousPayPeriod(current, schedule);
      assert.ok(previous.start >= addDays(today, -PAY_PERIOD_LOOKBACK_DAYS), `${today} ${describePaySchedule(schedule)}`);
      assert.ok(current.end <= addDays(today, PAY_PERIOD_LOOKAHEAD_DAYS), `${today} ${describePaySchedule(schedule)}`);
    }
  }
});

test("reads a schedule from the job's columns and ignores incomplete ones", () => {
  assert.deepEqual(payScheduleFromColumns({ pay_schedule: "every_n_weeks", pay_interval_weeks: 2, pay_anchor_date: "2026-10-15", pay_month_day: null, payday_offset_days: 6 }), { ...BIWEEKLY_THURSDAY, paydayOffsetDays: 6 });
  assert.deepEqual(payScheduleFromColumns({ pay_schedule: "monthly_day", pay_interval_weeks: null, pay_anchor_date: null, pay_month_day: 21, payday_offset_days: null }), MONTHLY_21ST);
  assert.equal(payScheduleFromColumns({ pay_schedule: "none", pay_interval_weeks: null, pay_anchor_date: null, pay_month_day: null, payday_offset_days: null }), null);
  assert.equal(payScheduleFromColumns({ pay_schedule: "every_n_weeks", pay_interval_weeks: null, pay_anchor_date: "2026-10-15", pay_month_day: null, payday_offset_days: null }), null);
  assert.equal(payFrequencyOf(BIWEEKLY_THURSDAY), "2w");
  assert.equal(payFrequencyOf(MONTHLY_21ST), "monthly");
  assert.equal(payFrequencyOf(null), "none");
});

test("labels and payday", () => {
  assert.equal(describePaySchedule(BIWEEKLY_THURSDAY), "Every 2 weeks from Thursday");
  assert.equal(describePaySchedule({ ...BIWEEKLY_THURSDAY, intervalWeeks: 1 }), "Every week from Thursday");
  assert.equal(describePaySchedule(MONTHLY_21ST), "Monthly from the 21st");
  assert.equal(describePaySchedule({ kind: "monthly_day", monthDay: 31, paydayOffsetDays: null }), "Monthly from the 31st (or the month's last day)");
  assert.equal(describePaySchedule({ kind: "monthly_day", monthDay: 12, paydayOffsetDays: null }), "Monthly from the 12th");
  const period = payPeriodFor("2026-10-20", BIWEEKLY_THURSDAY);
  assert.equal(paydayFor(period, BIWEEKLY_THURSDAY), null);
  assert.equal(paydayFor(period, { ...BIWEEKLY_THURSDAY, paydayOffsetDays: 9 }), "2026-11-06");
});

function shift(overrides: Partial<WorkedShift>): WorkedShift {
  return {
    jobId: "sodexo",
    jobName: "Sodexo",
    jobColor: "#0ea5e9",
    startsAt: new Date("2026-10-16T14:00:00Z"),
    endsAt: new Date("2026-10-16T18:00:00Z"),
    hourlyRateCents: 1_500,
    taxRateBasisPoints: 1_000,
    deductions: [],
    ...overrides,
  };
}

test("summarises worked, scheduled and previous-period pay per job", () => {
  const now = new Date("2026-10-20T16:00:00Z");
  const [sodexo, its] = summarizePayPeriods({
    now,
    timeZone: "UTC",
    jobs: [
      { id: "sodexo", name: "Sodexo", color: "#0ea5e9", schedule: { ...BIWEEKLY_THURSDAY, paydayOffsetDays: 8 } },
      { id: "its", name: "ITS", color: "#12b76a", schedule: MONTHLY_21ST },
      { id: "cafe", name: "Café", color: "#f79009", schedule: null },
    ],
    shifts: [
      shift({}), // 4h worked in the current period
      shift({ startsAt: new Date("2026-10-20T14:00:00Z"), endsAt: new Date("2026-10-20T18:00:00Z") }), // in progress: 2h worked, 2h scheduled
      shift({ startsAt: new Date("2026-10-27T14:00:00Z"), endsAt: new Date("2026-10-27T17:00:00Z") }), // 3h scheduled
      shift({ startsAt: new Date("2026-10-29T14:00:00Z"), endsAt: new Date("2026-10-29T17:00:00Z") }), // next period: ignored
      shift({ startsAt: new Date("2026-10-14T23:00:00Z"), endsAt: new Date("2026-10-15T01:00:00Z") }), // 1h previous + 1h current
      shift({ startsAt: new Date("2026-09-30T14:00:00Z"), endsAt: new Date("2026-09-30T15:00:00Z") }), // before the previous period
      shift({ jobId: "its", jobName: "ITS", startsAt: new Date("2026-10-01T14:00:00Z"), endsAt: new Date("2026-10-01T16:00:00Z") }),
      shift({ jobId: "cafe", jobName: "Café" }),
    ],
  });

  assert.equal(sodexo.scheduleLabel, "Every 2 weeks from Thursday");
  assert.deepEqual([sodexo.current.start, sodexo.current.end, sodexo.current.daysLeft], ["2026-10-15", "2026-10-29", 9]);
  assert.equal(sodexo.current.payday, "2026-11-05");
  assert.deepEqual(sodexo.current.worked, { minutes: 7 * 60, grossCents: 10_500, netCents: 9_450 });
  assert.deepEqual(sodexo.current.scheduled, { minutes: 5 * 60, grossCents: 7_500, netCents: 6_750 });
  assert.deepEqual([sodexo.previous.start, sodexo.previous.end, sodexo.previous.payday], ["2026-10-01", "2026-10-15", "2026-10-22"]);
  assert.deepEqual(sodexo.previous.worked, { minutes: 60, grossCents: 1_500, netCents: 1_350 });

  assert.deepEqual([its.current.start, its.current.end, its.current.payday], ["2026-09-21", "2026-10-21", null]);
  assert.equal(its.current.worked.minutes, 120);
  assert.equal(its.current.daysLeft, 1);
});

test("periods follow the viewer's zone, not UTC", () => {
  // 9 PM Wednesday Oct 14 in Chicago is already Thursday in UTC; it is still
  // the previous period's last evening for someone working in Chicago.
  const [summary] = summarizePayPeriods({
    now: new Date("2026-10-20T16:00:00Z"),
    timeZone: "America/Chicago",
    jobs: [{ id: "sodexo", name: "Sodexo", color: "#0ea5e9", schedule: BIWEEKLY_THURSDAY }],
    shifts: [shift({ startsAt: new Date("2026-10-15T02:00:00Z"), endsAt: new Date("2026-10-15T04:00:00Z") })],
  });
  assert.equal(summary.previous.worked.minutes, 120);
  assert.equal(summary.current.worked.minutes, 0);
});
