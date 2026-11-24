import assert from "node:assert/strict";
import test from "node:test";
import { fromZonedTime } from "date-fns-tz";
import type { BreakPeriod } from "./break-periods";
import { calculateEarnings } from "./earnings";
import { summarizePayHistory, type PaySchedule } from "./pay-period";
import {
  buildTimesheet, centsDecimal, decimalHours, readTimesheetParams, timesheetCsv, timesheetHref, timesheetPeriodFor, timesheetQueryWindow, weeksTouching,
  type CapShift, type TimesheetShift,
} from "./timesheet";

const ZONE = "America/Chicago";
const MONDAY = 1;
const BIWEEKLY_THURSDAY: PaySchedule = { kind: "every_n_weeks", intervalWeeks: 2, anchorDate: "2026-10-15", paydayOffsetDays: null };
// Thu Oct 15 up to, not including, Thu Oct 29. Monday weeks: Oct 12, Oct 19, Oct 26.
const PERIOD = { start: "2026-10-15", end: "2026-10-29" };
const AFTER = new Date("2027-01-01T00:00:00Z");

const at = (local: string) => fromZonedTime(local, ZONE);

function shift(id: string, start: string, end: string, overrides: Partial<TimesheetShift> = {}): TimesheetShift {
  return {
    id, jobId: "cafe", jobName: "Campus Cafe", jobColor: "#6d5ce7",
    startsAt: at(start), endsAt: at(end),
    hourlyRateCents: 1_537, taxRateBasisPoints: 1_250, deductions: [{ name: "Union", rateBasisPoints: 175 }],
    ...overrides,
  };
}

const cap = (shifts: TimesheetShift[]): CapShift[] => shifts.map(({ id, startsAt, endsAt }) => ({ id, startsAt, endsAt }));

function sheetOf(shifts: TimesheetShift[], options: { now?: Date; limitMinutes?: number | null; capShifts?: CapShift[]; breakPeriods?: BreakPeriod[] } = {}) {
  return buildTimesheet({
    period: PERIOD, shifts, capShifts: options.capShifts ?? cap(shifts), now: options.now ?? AFTER,
    timeZone: ZONE, weekStartsOn: MONDAY, limitMinutes: options.limitMinutes === undefined ? 1_200 : options.limitMinutes,
    breakPeriods: options.breakPeriods,
  });
}

test("money agrees to the cent with the pay-period history for the same period", () => {
  // Odd rates and minute counts so per-slice rounding actually matters; one
  // shift crosses midnight and one crosses the period's first boundary.
  const shifts = [
    shift("a", "2026-10-14T21:00:00", "2026-10-15T03:13:00"),
    shift("b", "2026-10-16T09:07:00", "2026-10-16T13:52:00"),
    shift("c", "2026-10-20T22:41:00", "2026-10-21T02:19:00", { jobId: "lib", jobName: "Library", hourlyRateCents: 1_613, taxRateBasisPoints: 800, deductions: [] }),
    shift("d", "2026-10-28T17:00:00", "2026-10-29T01:01:00"),
  ];
  const sheet = sheetOf(shifts);
  const history = summarizePayHistory({ periods: [PERIOD], schedule: BIWEEKLY_THURSDAY, shifts, now: AFTER, timeZone: ZONE })[0];

  assert.equal(sheet.worked.minutes, history.worked.minutes);
  assert.equal(sheet.worked.earnings.grossCents, history.worked.grossCents);
  assert.equal(sheet.worked.earnings.netCents, history.worked.netCents);

  // Every level sums to the same total: entries to days, days to the period, jobs to the period.
  const sum = (amounts: { minutes: number; earnings: { netCents: number; grossCents: number } }[]) => amounts.reduce((total, amount) => ({ minutes: total.minutes + amount.minutes, net: total.net + amount.earnings.netCents, gross: total.gross + amount.earnings.grossCents }), { minutes: 0, net: 0, gross: 0 });
  const expected = { minutes: sheet.worked.minutes, net: sheet.worked.earnings.netCents, gross: sheet.worked.earnings.grossCents };
  assert.deepEqual(sum(sheet.days.map((day) => day.worked)), expected);
  assert.deepEqual(sum(sheet.days.flatMap((day) => day.entries.map((entry) => entry.worked))), expected);
  assert.deepEqual(sum(sheet.jobs.map((job) => job.worked)), expected);
  for (const day of sheet.days) assert.deepEqual(sum(day.entries.map((entry) => entry.worked)), { minutes: day.worked.minutes, net: day.worked.earnings.netCents, gross: day.worked.earnings.grossCents }, day.date);
});

test("a shift crossing midnight is two rows, one per day, and slices outside the period are dropped", () => {
  const sheet = sheetOf([
    shift("before", "2026-10-14T21:00:00", "2026-10-15T03:00:00"),
    shift("night", "2026-10-20T22:00:00", "2026-10-21T02:30:00"),
  ]);
  assert.deepEqual(sheet.days.map((day) => day.date), ["2026-10-15", "2026-10-20", "2026-10-21"]);

  const [carried] = sheet.days[0].entries;
  assert.equal(carried.shiftId, "before");
  assert.equal(carried.worked.minutes, 180, "only the part on Oct 15 is in this period");
  assert.equal(carried.continuesFromPreviousDay, true);
  assert.equal(carried.startsAt.toISOString(), at("2026-10-15T00:00:00").toISOString());

  const evening = sheet.days[1].entries[0];
  const morning = sheet.days[2].entries[0];
  assert.deepEqual([evening.worked.minutes, evening.continuesNextDay, evening.continuesFromPreviousDay], [120, true, false]);
  assert.deepEqual([morning.worked.minutes, morning.continuesNextDay, morning.continuesFromPreviousDay], [150, false, true]);
  assert.equal(evening.worked.earnings.grossCents, calculateEarnings(120, { hourlyRateCents: 1_537, taxRateBasisPoints: 0, deductions: [] }).grossCents);
});

test("worked time is clipped at now; the rest of an in-progress shift and later shifts are planned and earn nothing yet", () => {
  const now = at("2026-10-22T12:00:00");
  const sheet = sheetOf([
    shift("done", "2026-10-20T09:00:00", "2026-10-20T13:00:00"),
    shift("running", "2026-10-22T10:00:00", "2026-10-22T14:30:00"),
    shift("later", "2026-10-24T09:00:00", "2026-10-24T12:00:00"),
  ], { now });

  const running = sheet.days.find((day) => day.date === "2026-10-22")!.entries[0];
  assert.equal(running.status, "in_progress");
  assert.deepEqual([running.worked.minutes, running.scheduled.minutes], [120, 150]);
  assert.equal(sheet.days.find((day) => day.date === "2026-10-24")!.entries[0].status, "scheduled");
  assert.equal(sheet.worked.minutes, 240 + 120);
  assert.equal(sheet.scheduled.minutes, 150 + 180);
  assert.equal(sheet.worked.earnings.grossCents, calculateEarnings(240, { hourlyRateCents: 1_537, taxRateBasisPoints: 0, deductions: [] }).grossCents + calculateEarnings(120, { hourlyRateCents: 1_537, taxRateBasisPoints: 0, deductions: [] }).grossCents);
});

test("overnight rows have a status for their own date and a CSV end of 24:00 even when the shift stops there", () => {
  const overnight = shift("night", "2026-10-20T22:00:00", "2026-10-21T02:30:00");
  const midnight = shift("midnight", "2026-10-19T22:00:00", "2026-10-20T00:00:00");
  const sheet = sheetOf([overnight, midnight], { now: at("2026-10-21T00:30:00") });
  const [endedAtMidnight, evening, morning] = sheet.days.flatMap((day) => day.entries);
  assert.deepEqual([endedAtMidnight.endsAtNextMidnight, endedAtMidnight.continuesNextDay], [true, false]);
  assert.deepEqual([evening.status, morning.status], ["worked", "in_progress"]);
  assert.deepEqual([evening.worked.minutes, morning.worked.minutes, morning.scheduled.minutes], [120, 30, 120]);

  const csv = timesheetCsv(sheet, { title: "Campus Cafe", scopeLabel: "Campus Cafe only", timeZone: ZONE, generatedAt: AFTER });
  assert.ok(csv.includes('"2026-10-19","Mon","Campus Cafe","22:00","24:00","","Worked","120",'));
  assert.ok(csv.includes('"2026-10-20","Tue","Campus Cafe","22:00","24:00","continues next day","Worked","120",'));
});

test("weeks are the profile's weeks, and a week split by the period is judged on its whole total", () => {
  assert.deepEqual(weeksTouching(PERIOD, ZONE, MONDAY).map((week) => [week.start, week.end]), [["2026-10-12", "2026-10-19"], ["2026-10-19", "2026-10-26"], ["2026-10-26", "2026-11-02"]]);
  assert.deepEqual(weeksTouching(PERIOD, ZONE, 4).map((week) => week.start), ["2026-10-15", "2026-10-22"], "a Thursday week lines up with this period exactly");

  // 12h on Mon-Tue Oct 12-13 (outside the period) plus 10h on Thu Oct 15 (inside): 22h that week.
  const outside = [shift("mon", "2026-10-12T08:00:00", "2026-10-12T20:00:00")];
  const inside = [shift("thu", "2026-10-15T08:00:00", "2026-10-15T18:00:00")];
  const sheet = sheetOf(inside, { capShifts: cap([...outside, ...inside]) });
  const first = sheet.weeks[0];
  assert.deepEqual([first.minutes, first.inPeriodMinutes, first.extendsOutsidePeriod, first.over], [1_320, 600, true, true]);
  assert.equal(sheet.verdict.kind, "over");
  assert.equal(sheet.verdict.headline, "Over 20h in 1 of 3 weeks");
  assert.equal(sheet.worked.minutes, 600, "the rows still show only this period");
});

test("the window reads whole weeks, including the DST week", () => {
  const window = timesheetQueryWindow(PERIOD, ZONE, MONDAY);
  assert.equal(window.weeksStart.toISOString(), at("2026-10-12T00:00:00").toISOString());
  // Nov 1 2026 ends daylight time in Chicago: the last week is 169 hours, and ends at local midnight.
  assert.equal(window.weeksEnd.toISOString(), at("2026-11-02T00:00:00").toISOString());
  assert.equal(window.periodEnd.toISOString(), at("2026-10-29T00:00:00").toISOString());
});

test("skipping midnight on the first day does not add the previous cap week", () => {
  const period = { start: "2026-03-08", end: "2026-03-15" };
  const window = timesheetQueryWindow(period, "America/Havana", 0);
  assert.equal(window.firstWeekDate, "2026-03-08");
  assert.equal(window.lastWeekDate, "2026-03-08");
  assert.equal(window.weeksStart.toISOString(), "2026-03-08T05:00:00.000Z");
});

test("timesheet links fall back if the requested period or its cap weeks cannot be represented", () => {
  const today = "2026-10-20";
  const monthly = { kind: "monthly_day", monthDay: 30, paydayOffsetDays: null } as const;
  for (const schedule of [BIWEEKLY_THURSDAY, monthly]) {
    const current = timesheetPeriodFor(undefined, today, schedule);
    assert.deepEqual(timesheetPeriodFor("0001-01-01", today, schedule), current);
    assert.deepEqual(timesheetPeriodFor("9999-12-31", today, schedule), current);
  }
  assert.deepEqual(timesheetPeriodFor("2026-10-16", today, BIWEEKLY_THURSDAY), PERIOD);
});

test("verdict: under, exactly at the cap, no cap, and a week still in progress", () => {
  const twentyHours = [
    shift("a", "2026-10-19T08:00:00", "2026-10-19T18:00:00"),
    shift("b", "2026-10-20T08:00:00", "2026-10-20T18:00:00"),
  ];
  const atCap = sheetOf(twentyHours);
  assert.equal(atCap.weeks[1].minutes, 1_200);
  assert.equal(atCap.weeks[1].over, false, "reaching the cap exactly is allowed, as the trigger allows it");
  assert.equal(atCap.verdict.kind, "at_cap");
  assert.equal(atCap.verdict.headline, "Stayed within 20h each week");

  const under = sheetOf([shift("a", "2026-10-19T08:00:00", "2026-10-19T18:45:00")]);
  assert.equal(under.verdict.kind, "under");
  assert.equal(under.verdict.headline, "Stayed under 20h each week");
  assert.match(under.verdict.detail, /Busiest week: 10h 45m, week of Oct 19\./);

  assert.equal(sheetOf(twentyHours, { limitMinutes: null }).verdict.kind, "no_cap");

  const live = sheetOf(twentyHours.slice(0, 1), { now: at("2026-10-21T12:00:00") });
  assert.deepEqual(live.weeks.map((week) => [week.provisional, week.started]), [[false, true], [true, true], [true, false]]);
  assert.equal(live.verdict.provisional, true);
  assert.equal(live.verdict.headline, "On track to stay under 20h each week");
  assert.match(live.verdict.detail, /include planned shifts/);

  assert.equal(sheetOf([]).verdict.detail.startsWith("No hours"), true);
});

test("break caps replace the overall cap for the covered week, including a week starting outside the pay period", () => {
  const shifts = [
    shift("first", "2026-10-15T06:00:00", "2026-10-15T18:00:00"),
    shift("second", "2026-10-19T06:00:00", "2026-10-19T18:00:00"),
    shift("second-more", "2026-10-20T06:00:00", "2026-10-20T16:00:00"),
  ];
  const breakPeriods = [{ id: "break", start_date: "2026-10-12", end_date: "2026-10-12", weekly_limit_minutes: 600, label: null }];
  const sheet = sheetOf(shifts, { breakPeriods });
  assert.deepEqual(sheet.weeks.map(({ limitMinutes, breakCap, over }) => [limitMinutes, breakCap, over]), [[600, true, true], [1_200, false, true], [1_200, false, false]]);
  assert.equal(sheet.verdict.headline, "Over the cap in 2 of 3 weeks");
  const csv = timesheetCsv(sheet, { title: "All jobs", scopeLabel: "All active jobs", timeZone: ZONE, generatedAt: AFTER });
  assert.ok(csv.includes('"Weekly cap","Varies by week"'));
  assert.ok(csv.includes('"2026-10-12","2026-10-18","12.00","12.00","10.00","over cap"'));

  const mixed = sheetOf(shifts, { breakPeriods, limitMinutes: null });
  assert.equal(mixed.verdict.overWeeks, 1);
  assert.equal(mixed.verdict.kind, "over");
  assert.equal(mixed.weeks[1].limitMinutes, null);
  const atBreakCap = sheetOf(shifts, { breakPeriods: [{ ...breakPeriods[0], weekly_limit_minutes: 720 }], limitMinutes: null });
  assert.equal(atBreakCap.verdict.kind, "at_cap", "at-cap detection uses the week with a cap rather than the busiest week");
});

test("decimal hours and cents format without float drift", () => {
  assert.equal(decimalHours(1_200), "20h");
  assert.equal(decimalHours(1_170), "19.5h");
  assert.equal(decimalHours(1_175), "19.58h");
  assert.equal(centsDecimal(0), "0.00");
  assert.equal(centsDecimal(5), "0.05");
  assert.equal(centsDecimal(123_456), "1234.56");
  assert.equal(centsDecimal(-250), "-2.50");
});

test("CSV: sections, money straight from cents, and job names cannot run as formulas", () => {
  const sheet = sheetOf([
    shift("a", "2026-10-20T22:00:00", "2026-10-21T02:30:00", { jobName: "=HYPERLINK(\"x\")" }),
  ]);
  const csv = timesheetCsv(sheet, { title: "All jobs", scopeLabel: "All active jobs", timeZone: ZONE, generatedAt: AFTER });
  assert.ok(csv.startsWith("﻿"));
  assert.ok(csv.includes("\r\n"));
  for (const section of ['"Shifts"', '"Days"', '"Jobs"', '"Weeks"']) assert.ok(csv.includes(`\r\n${section}\r\n`), section);
  assert.ok(csv.includes(`"'=HYPERLINK(""x"")"`), "a leading = is defused");
  assert.ok(!/(^|,)"=/m.test(csv), "no cell starts with =");
  assert.ok(csv.includes(`"Worked net pay","${centsDecimal(sheet.worked.earnings.netCents)}"`));
  assert.ok(csv.includes('"2026-10-20","Tue"'), "the evening half");
  assert.ok(csv.includes('"22:00","24:00","continues next day"'));
  assert.ok(csv.includes('"2026-10-21","Wed"'), "the morning half");
  assert.ok(csv.includes('"2026-10-19","2026-10-25","4.50","4.50","20.00","under cap"'));
});

test("address parameters: bad values fall back instead of failing, and the href round-trips", () => {
  const read = (values: Record<string, string>) => readTimesheetParams((name) => values[name]);
  assert.deepEqual(read({}), { job: undefined, start: undefined, scope: "all" });
  assert.deepEqual(read({ job: "not-a-uuid", start: "2026-02-30", scope: "everything" }), { job: undefined, start: undefined, scope: "all" });
  const job = "3f1c2d4e-5a6b-4c7d-8e9f-0a1b2c3d4e5f";
  assert.deepEqual(read({ job, start: "2026-10-15", scope: "job" }), { job, start: "2026-10-15", scope: "job" });

  const href = timesheetHref("/pay-periods/timesheet/export", { job, start: "2026-10-15", scope: "job" });
  const search = new URL(href, "https://example.test").searchParams;
  assert.deepEqual(readTimesheetParams((name) => search.get(name)), { job, start: "2026-10-15", scope: "job" });
  assert.ok(!timesheetHref("/pay-periods/timesheet", { job, start: "2026-10-15", scope: "all" }).includes("scope"));
});
