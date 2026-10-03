import assert from "node:assert/strict";
import test from "node:test";
import { addLocalDays, addMonths, monthGridDays, monthLabel, resolveCalendarRange } from "./calendar-range";

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

test("an extreme year falls back to today instead of looping or overflowing", () => {
  for (const date of ["0000-01-01", "0000-01-20", "9999-12-31", "1899-12-31", "2201-01-01"]) {
    for (const view of ["week", "month"]) {
      const range = resolveCalendarRange({ view, date }, now, tz, 0);
      assert.equal(range.anchor, "2026-09-30", `${view} ${date}`);
      assert.ok(range.days.length === 7 || (range.days.length >= 28 && range.days.length <= 42), `${view} ${date}: ${range.days.length} days`);
    }
  }
});

test("the mini month is always six whole weeks starting on the week-start day", () => {
  for (const [month, weekStartsOn] of [["2026-10", 0], ["2026-10", 1], ["2026-02", 0], ["2026-03", 0], ["2026-11", 6]] as const) {
    const days = monthGridDays(month, weekStartsOn);
    assert.equal(days.length, 42, month);
    assert.equal(new Date(`${days[0]}T12:00:00Z`).getUTCDay(), weekStartsOn, `${month} starts on ${weekStartsOn}`);
    assert.ok(days.includes(`${month}-01`), `${month} has its 1st`);
    const last = addLocalDays(`${addMonths(`${month}-01`, 1)}`, -1);
    assert.ok(days.includes(last), `${month} has its last day ${last}`);
    // Consecutive days, even across the daylight-saving changes in March and November.
    for (let index = 1; index < days.length; index++) assert.equal(days[index], addLocalDays(days[index - 1], 1));
  }
  assert.deepEqual(monthGridDays("2026-10", 0).slice(0, 7), ["2026-09-27", "2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03"]);
  assert.equal(monthLabel("2026-10"), "October 2026");
  assert.equal(addMonths("2026-12-01", 1), "2027-01-01");
  assert.equal(addMonths("2026-01-01", -1), "2025-12-01");
});
