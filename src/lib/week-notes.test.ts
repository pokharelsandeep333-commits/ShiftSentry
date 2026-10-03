import assert from "node:assert/strict";
import test from "node:test";
import { isWeekStart, noteForWeek, weekStartDate, weekStartOfLocalDate } from "./week-notes";

const tz = "America/Chicago";

test("the key is the local date the week starts on, for any week-start day", () => {
  const friday = new Date("2026-10-02T23:30:00.000Z"); // Fri Oct 2, 6:30 PM Chicago
  assert.equal(weekStartDate(friday, tz, 0), "2026-09-27");
  assert.equal(weekStartDate(friday, tz, 1), "2026-09-28");
  assert.equal(weekStartDate(friday, tz, 5), "2026-10-02");
  assert.equal(weekStartDate(friday, tz, 6), "2026-09-26");
  // 03:30 UTC Saturday is still Friday evening in Chicago.
  assert.equal(weekStartDate(new Date("2026-10-03T03:30:00.000Z"), tz, 6), "2026-09-26");
});

test("a week across the end of daylight saving keeps its start date", () => {
  const sunday = new Date("2026-11-01T15:00:00.000Z"); // DST ends that morning
  assert.equal(weekStartDate(sunday, tz, 0), "2026-11-01");
  assert.equal(weekStartDate(new Date("2026-11-07T23:00:00.000Z"), tz, 0), "2026-11-01");
  assert.equal(weekStartOfLocalDate("2026-11-04", tz, 0).toISOString(), "2026-11-01T05:00:00.000Z");
});

test("the note saved on the week's start wins over one saved inside it", () => {
  const notes = [{ id: "b", week_start: "2026-09-28", body: "inside" }, { id: "a", week_start: "2026-09-27", body: "exact" }];
  assert.deepEqual(noteForWeek(notes, "2026-09-27"), { id: "a", body: "exact", legacy: false });
});

test("a note from before a week-start change is found in the week that now holds it", () => {
  // Saved while weeks started on Sunday; the user then switched to Monday.
  const notes = [{ id: "n", week_start: "2026-09-27", body: "Asked for Friday off" }];
  assert.deepEqual(noteForWeek(notes, "2026-09-21"), { id: "n", body: "Asked for Friday off", legacy: true });
  assert.equal(noteForWeek(notes, "2026-09-28"), null);
  assert.equal(noteForWeek([], "2026-09-28"), null);
});

test("only a real date on the week-start weekday is a week start", () => {
  assert.equal(isWeekStart("2026-09-27", 0), true);
  assert.equal(isWeekStart("2026-09-27", 1), false);
  assert.equal(isWeekStart("2026-09-28", 1), true);
  assert.equal(isWeekStart("2026-02-30", 1), false);
  assert.equal(isWeekStart("27-09-2026", 0), false);
  assert.equal(isWeekStart("", 0), false);
});
