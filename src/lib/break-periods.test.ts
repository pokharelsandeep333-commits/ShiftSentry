import assert from "node:assert/strict";
import test from "node:test";
import { breakPeriodForWeek } from "./break-periods";
import { checkOccurrences } from "./limit-check";
import { breakPeriodSchema } from "./validation";

const winter = { id: "winter", start_date: "2026-12-16", end_date: "2027-01-04", weekly_limit_minutes: 2_400, label: "Winter break" };
const base = { jobId: "campus", existing: [], timeZone: "America/Chicago", weekStartsOn: 1, globalLimit: 1_200, jobLimit: null, breakPeriods: [winter] };
const shift = (start: string, end: string) => ({ startsAt: new Date(start), endsAt: new Date(end) });

test("only the inclusive week-start date chooses the override", () => {
  assert.equal(breakPeriodForWeek([winter], "2026-12-14"), null);
  assert.equal(breakPeriodForWeek([winter], winter.start_date), winter);
  assert.equal(breakPeriodForWeek([winter], "2026-12-21"), winter);
  assert.equal(breakPeriodForWeek([winter], winter.end_date), winter);
  assert.equal(breakPeriodForWeek([winter], "2027-01-11"), null);
});

test("repeats use the default, break, and default caps according to each local week start", () => {
  const results = checkOccurrences({
    ...base,
    occurrences: [
      shift("2026-12-17T06:00:00Z", "2026-12-18T05:00:00Z"),
      shift("2026-12-24T06:00:00Z", "2026-12-25T05:00:00Z"),
      shift("2027-01-07T06:00:00Z", "2027-01-08T05:00:00Z"),
      shift("2027-01-14T06:00:00Z", "2027-01-15T05:00:00Z"),
    ],
  });
  assert.deepEqual(results.map((result) => [result.weeks[0].globalLimit, result.fits]), [
    [1_200, false], [2_400, true], [2_400, true], [1_200, false],
  ]);
});

test("an overnight shift uses each touched week's cap even with no default limit", () => {
  const [result] = checkOccurrences({
    ...base,
    globalLimit: null,
    breakPeriods: [{ ...winter, weekly_limit_minutes: 45 }],
    occurrences: [shift("2026-12-21T05:00:00Z", "2026-12-21T07:00:00Z")],
  });
  assert.deepEqual(result.weeks.map((week) => [week.minutes, week.globalLimit]), [[60, null], [60, 45]]);
  assert.equal(result.over, "global");
});

test("a job's own limit still applies during a break", () => {
  const [result] = checkOccurrences({
    ...base,
    jobLimit: 120,
    occurrences: [shift("2026-12-24T06:00:00Z", "2026-12-24T08:01:00Z")],
  });
  assert.equal(result.weeks[0].globalLimit, 2_400);
  assert.equal(result.over, "job");
});

test("the shift preview and break-change confirmation count existing shifts the same way", () => {
  // Matches the archived shift and split week in 30_break_period_confirmation.sql.
  const existing = [
    { id: "archived", jobId: "archive", ...shift("2026-11-17T06:00:00Z", "2026-11-18T03:00:31Z") },
    { id: "overnight", jobId: "campus", ...shift("2026-11-30T05:30:00Z", "2026-11-30T06:30:00Z") },
    { id: "day", jobId: "campus", ...shift("2026-12-01T06:00:00Z", "2026-12-02T02:00:00Z") },
  ];
  const results = checkOccurrences({
    ...base, existing, breakPeriods: [],
    occurrences: [
      shift("2026-11-19T06:00:00Z", "2026-11-19T06:01:00Z"),
      shift("2026-12-04T06:00:00Z", "2026-12-04T06:01:00Z"),
    ],
  });
  assert.deepEqual(results.map(({ weeks, over }) => [weeks[0].globalAfter - weeks[0].minutes, weeks[0].globalLimit, over]),
    [[1261, 1200, "global"], [1230, 1200, "global"]]);
});

test("a skipped local midnight keeps the break on the calendar date and splits shifts at the SQL boundary", () => {
  const [result] = checkOccurrences({
    ...base,
    timeZone: "America/Havana",
    weekStartsOn: 0,
    globalLimit: null,
    breakPeriods: [{ ...winter, start_date: "2026-03-08", end_date: "2026-03-08", weekly_limit_minutes: 45 }],
    occurrences: [shift("2026-03-08T04:30:00Z", "2026-03-08T05:30:00Z")],
  });
  assert.deepEqual(result.weeks.map((week) => [week.minutes, week.globalLimit]), [[30, null], [30, 45]]);
  assert.equal(result.fits, true);
});

test("break settings validate local dates, cap bounds, and the optional label", () => {
  const values = { startDate: "2028-02-29", endDate: "2028-02-29", weeklyLimitMinutes: 1, label: "  Spring break  " };
  assert.equal(breakPeriodSchema.parse(values).label, "Spring break");
  for (const invalid of [
    { startDate: "2027-02-29" }, { startDate: "0000-02-29" }, { endDate: "2028-02-28" },
    { weeklyLimitMinutes: 0 }, { weeklyLimitMinutes: 10_081 }, { label: "x".repeat(101) },
  ]) assert.equal(breakPeriodSchema.safeParse({ ...values, ...invalid }).success, false);
});
