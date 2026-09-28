import assert from "node:assert/strict";
import test from "node:test";
import { addLocalDays, resolveCalendarRange } from "./calendar-range";

const tz = "America/Chicago";
const now = new Date("2026-09-30T15:00:00.000Z"); // Wed Sep 30, 10 AM Chicago

test("week view starts on the profile's week-start day", () => {
  const sunday = resolveCalendarRange({}, now, tz, 0);
  assert.equal(sunday.view, "week");
  assert.equal(sunday.days[0], "2026-09-27");
  assert.equal(sunday.days.length, 7);
  assert.equal(sunday.prev, "2026-09-20");
  assert.equal(sunday.next, "2026-10-04");
  assert.equal(sunday.timeMin, "2026-09-27T05:00:00.000Z");
  assert.equal(sunday.timeMax, "2026-10-04T05:00:00.000Z");
  assert.equal(sunday.label, "Sep 27 – Oct 3, 2026");
  assert.equal(resolveCalendarRange({}, now, tz, 1).days[0], "2026-09-28");
});

test("month view covers whole weeks around the month", () => {
  const range = resolveCalendarRange({ view: "month", date: "2026-09-15" }, now, tz, 0);
  assert.equal(range.days[0], "2026-08-30");
  assert.equal(range.days.at(-1), "2026-10-03");
  assert.equal(range.days.length, 35);
  assert.equal(range.month, "2026-09");
  assert.equal(range.prev, "2026-08-01");
  assert.equal(range.next, "2026-10-01");
  assert.equal(range.label, "September 2026");
});

test("a bad or impossible date falls back to today, and an unknown view to week", () => {
  assert.equal(resolveCalendarRange({ date: "2026-02-30" }, now, tz, 0).anchor, "2026-09-30");
  assert.equal(resolveCalendarRange({ date: "nope" }, now, tz, 0).anchor, "2026-09-30");
  assert.equal(resolveCalendarRange({ view: "year" }, now, tz, 0).view, "week");
});

test("a week across the end of daylight saving still has seven days and exact bounds", () => {
  const range = resolveCalendarRange({ date: "2026-11-02" }, now, tz, 0);
  assert.equal(range.days[0], "2026-11-01");
  assert.equal(range.days.length, 7);
  assert.equal(range.timeMin, "2026-11-01T05:00:00.000Z");
  assert.equal(range.timeMax, "2026-11-08T06:00:00.000Z");
});

test("local day arithmetic crosses months and years", () => {
  assert.equal(addLocalDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addLocalDays("2026-03-01", -1), "2026-02-28");
});
