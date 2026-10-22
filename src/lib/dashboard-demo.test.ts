import assert from "node:assert/strict";
import test from "node:test";
import { formatInTimeZone } from "date-fns-tz";
import { demoDashboard, demoDashboardFor } from "./dashboard-demo";

const zone = demoDashboard.viewer.timeZone;

test("the sample's next shift is the coming Friday, 11 AM to 2 PM in its zone", () => {
  // Wednesday Oct 21 2026, 6 PM in Chicago.
  const [shift] = demoDashboardFor(new Date("2026-10-21T23:00:00Z")).upcomingShifts;
  assert.equal(formatInTimeZone(shift.startsAt, zone, "EEE yyyy-MM-dd HH:mm"), "Fri 2026-10-23 11:00");
  assert.equal(formatInTimeZone(shift.endsAt, zone, "HH:mm"), "14:00");
});

test("on a Friday after 11 AM it moves to the next Friday, so it is never in the past", () => {
  const friday = new Date("2026-10-23T17:00:00Z"); // noon in Chicago
  const [shift] = demoDashboardFor(friday).upcomingShifts;
  assert.ok(Date.parse(shift.startsAt) > friday.getTime());
  assert.equal(formatInTimeZone(shift.startsAt, zone, "yyyy-MM-dd"), "2026-10-30");
});

test("the months end with the current one and the chart's six match the totals' last six", () => {
  const data = demoDashboardFor(new Date("2026-10-21T23:00:00Z"));
  const keys = data.totals.months.map((month) => month.key);
  assert.equal(keys.at(-1), "2026-10");
  assert.deepEqual(keys, [...keys].sort());
  assert.equal(data.totals.months.at(-1)?.label, "Oct 2026");
  assert.deepEqual(data.monthlyJobAllocation.months.map((month) => month.key), keys.slice(-6));
  assert.equal(data.monthlyJobAllocation.months[0].label, "May");
});

test("a year boundary relabels across it", () => {
  const keys = demoDashboardFor(new Date("2027-02-10T18:00:00Z")).totals.months.map((month) => month.key);
  assert.deepEqual(keys.slice(0, 2), ["2026-07", "2026-08"]);
  assert.equal(keys.at(-1), "2027-02");
});

test("daily sample hours, weekly capacity, and earned totals stay consistent as the week changes", () => {
  for (const instant of ["2026-10-18T06:00:00Z", "2026-10-21T23:00:00Z", "2026-10-24T18:00:00Z", "2026-11-01T18:00:00Z"]) {
    const data = demoDashboardFor(new Date(instant));
    assert.equal(data.weekDays.reduce((total, day) => total + day.workedMinutes, 0), data.totals.week.minutes, instant);
    assert.equal(data.weekDays.reduce((total, day) => total + day.workedMinutes + day.scheduledMinutes, 0), data.loggedMinutes + data.scheduledMinutes, instant);
    assert.equal(data.totals.week.jobs.reduce((total, job) => total + job.netCents, 0), data.totals.week.earnings.netCents, instant);
  }
});
