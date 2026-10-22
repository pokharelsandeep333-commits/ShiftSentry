import assert from "node:assert/strict";
import test from "node:test";
import { fromZonedTime } from "date-fns-tz";
import { buildDashboardInsights, jobEarningsBreakdown, nextPaydayFor, recentCompletedShifts, type DashboardShift } from "./dashboard-insights";
import type { PayPeriodSummary } from "./pay-period";

const zone = "America/Chicago";
const at = (local: string) => fromZonedTime(local, zone);
function shift(start: string, end: string, id = "one"): DashboardShift {
  return { id, jobId: "desk", jobName: "Desk", jobColor: "#9486ff", startsAt: at(start), endsAt: at(end), hourlyRateCents: 1_200, taxRateBasisPoints: 0, deductions: [] };
}

test("seven local days respect the user's first weekday and mark local today", () => {
  const data = buildDashboardInsights([], at("2026-10-21T20:00:00"), zone, 1);
  assert.equal(data.weekDays.length, 7);
  assert.equal(data.weekDays[0].date, "2026-10-19");
  assert.equal(data.weekDays[6].date, "2026-10-25");
  assert.equal(data.weekDays.find((day) => day.isToday)?.date, "2026-10-21");
  assert.equal(data.weekDays[0].weekday, "Mon");
});

test("an overnight shift is clipped at the local week boundary, preserving its edit target", () => {
  const data = buildDashboardInsights([shift("2026-10-18T23:00", "2026-10-19T02:00")], at("2026-10-21T12:00"), zone, 1);
  assert.equal(data.weekDays[0].workedMinutes, 120);
  assert.equal(data.weekDays[0].shifts[0].id, "one");
  assert.equal(data.weekDays[0].shifts[0].minutes, 120);
  assert.equal(data.weekDays[0].shifts[0].startsAt, at("2026-10-18T23:00").toISOString());
});

test("a running shift separates worked time from its scheduled remainder", () => {
  const data = buildDashboardInsights([shift("2026-10-21T09:00", "2026-10-21T13:00")], at("2026-10-21T10:30"), zone, 0);
  const day = data.weekDays.find((entry) => entry.isToday)!;
  assert.equal(day.workedMinutes, 90);
  assert.equal(day.scheduledMinutes, 150);
  assert.equal(day.shifts[0].minutes, 240);
});

test("the autumn DST day counts the repeated hour as actual work", () => {
  const data = buildDashboardInsights([shift("2026-11-01T00:00", "2026-11-01T03:00")], at("2026-11-02T12:00"), zone, 0);
  // That Sunday is in the prior week with a Monday start, and this week with Sunday.
  assert.equal(data.weekDays[0].workedMinutes, 240);
});

test("last week is clipped to the same local weekday and clock time across DST", () => {
  const data = buildDashboardInsights([
    shift("2026-10-28T15:00", "2026-10-28T19:00"),
    shift("2026-10-29T09:00", "2026-10-29T12:00", "later"),
  ], at("2026-11-04T16:00"), zone, 0);
  assert.equal(data.weekComparison.previous.minutes, 60);
  assert.equal(data.weekComparison.previous.earnings.netCents, 1_200);
  assert.equal(data.weekComparison.throughLabel, "Wednesday, 4:00 PM");
});

test("comparison rounds each local day through the shared earnings accumulator", () => {
  const data = buildDashboardInsights([{ ...shift("2026-10-12T23:59", "2026-10-13T00:01"), hourlyRateCents: 1_000 }], at("2026-10-21T12:00"), zone, 0);
  assert.equal(data.weekComparison.previous.minutes, 2);
  assert.equal(data.weekComparison.previous.earnings.netCents, 34);
});

function payroll(id: string, previousDate: string | null, currentDate: string | null): PayPeriodSummary {
  return { jobId: id, jobName: id, jobColor: "#9486ff", scheduleLabel: "Monthly", current: { start: "2026-10-01", end: "2026-11-01", daysLeft: 11, payday: currentDate, worked: { minutes: 60, grossCents: 1_000, netCents: 900 }, scheduled: { minutes: 60, grossCents: 1_000, netCents: 900 } }, previous: { start: "2026-09-01", end: "2026-10-01", payday: previousDate, worked: { minutes: 120, grossCents: 2_000, netCents: 1_800 } } };
}

test("next payday includes a prior period paid in arrears and groups only matching dates", () => {
  const result = nextPaydayFor([payroll("A", "2026-10-23", "2026-11-03"), payroll("B", "2026-10-23", "2026-11-04"), payroll("C", "2026-10-20", "2026-11-05")], "2026-10-21")!;
  assert.equal(result.date, "2026-10-23");
  assert.equal(result.netCents, 3_600);
  assert.deepEqual(result.jobs.map((job) => job.jobId), ["A", "B"]);
});

test("current-payday estimates include scheduled time and retain a payday due today", () => {
  const result = nextPaydayFor([payroll("A", "2026-10-20", "2026-10-21")], "2026-10-21")!;
  assert.equal(result.netCents, 1_800);
  assert.equal(nextPaydayFor([payroll("A", null, null)], "2026-10-21"), null);
  assert.equal(nextPaydayFor([], "2026-10-21"), null);
});

test("weekly forecast includes only the remaining part of running and scheduled shifts in this local week", () => {
  const data = buildDashboardInsights([
    shift("2026-10-21T09:00", "2026-10-21T13:00", "running"),
    shift("2026-10-22T09:00", "2026-10-22T11:00", "future"),
    shift("2026-10-20T09:00", "2026-10-20T11:00", "past"),
    shift("2026-10-25T09:00", "2026-10-25T11:00", "next-week"),
  ], at("2026-10-21T10:30"), zone, 0);
  assert.deepEqual(data.weekForecast, { remainingMinutes: 270, remainingNetCents: 5_400, remainingShiftCount: 2 });
});

test("forecast clips an overnight shift at the week end and uses its stored tax snapshot", () => {
  const data = buildDashboardInsights([{ ...shift("2026-10-24T23:00", "2026-10-25T02:00"), taxRateBasisPoints: 1_000 }], at("2026-10-21T12:00"), zone, 0);
  assert.deepEqual(data.weekForecast, { remainingMinutes: 60, remainingNetCents: 1_080, remainingShiftCount: 1 });
  assert.deepEqual(buildDashboardInsights([], at("2026-10-21T12:00"), zone, 0).weekForecast, { remainingMinutes: 0, remainingNetCents: 0, remainingShiftCount: 0 });
});

test("forecast preserves actual time across a repeated DST hour", () => {
  const data = buildDashboardInsights([shift("2026-11-01T00:00", "2026-11-01T03:00")], at("2026-10-31T12:00"), zone, 1);
  assert.equal(data.weekForecast.remainingMinutes, 240);
  assert.equal(data.weekForecast.remainingNetCents, 4_800);
});

test("recent shifts are the latest five completed by end time, excluding running and future work", () => {
  const shifts = Array.from({ length: 7 }, (_, index) => shift(`2026-10-${String(10 + index).padStart(2, "0")}T09:00`, `2026-10-${String(10 + index).padStart(2, "0")}T10:00`, `shift-${index}`));
  const result = recentCompletedShifts([
    ...shifts.reverse(),
    shift("2026-10-21T09:00", "2026-10-21T13:00", "running"),
    shift("2026-10-22T09:00", "2026-10-22T13:00", "future"),
  ], at("2026-10-21T10:00"), zone);
  assert.deepEqual(result.map((entry) => entry.id), ["shift-6", "shift-5", "shift-4", "shift-3", "shift-2"]);
  assert.equal(result[0].minutes, 60);
  assert.equal(result[0].netCents, 1_200);
});

test("recent overnight pay uses per-day rounding and includes work ending exactly now", () => {
  const result = recentCompletedShifts([{ ...shift("2026-10-20T23:59", "2026-10-21T00:01"), hourlyRateCents: 1_000 }], at("2026-10-21T00:01"), zone);
  assert.equal(result[0].netCents, 34);
  assert.equal(result[0].minutes, 2);
  assert.deepEqual(recentCompletedShifts([], at("2026-10-21T00:01"), zone), []);
});

test("job take-home rates derive from earned money and worked minutes, with safe zero states", () => {
  const jobs = [{ id: "A", name: "A", color: "#9486ff", netCents: 900, minutes: 30 }, { id: "B", name: "B", color: "#32d583", netCents: 1_200, minutes: 60 }];
  const rows = jobEarningsBreakdown(jobs);
  assert.deepEqual(rows.map((row) => [row.id, row.netPerHourCents, row.sharePercent]), [["B", 1_200, 57], ["A", 1_800, 43]]);
  assert.equal(jobs[0].id, "A");
  assert.equal(jobEarningsBreakdown([{ ...jobs[0], netCents: 0, minutes: 0 }])[0].netPerHourCents, null);
  assert.equal(jobEarningsBreakdown([{ ...jobs[0], netCents: 0 }])[0].sharePercent, null);
});
