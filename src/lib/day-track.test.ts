import assert from "node:assert/strict";
import test from "node:test";
import { addLocalDays, clockLabel, dayBlocks, drawSelection, minuteOf, moveEnd, moveSelection, moveStart, overlapsBlock, placeSelection, scheduleOf, selectionOf, timeOf, trackPercent, weekDates, weekStartDate } from "./day-track";

test("dates move by whole days and weeks start on the viewer's day", () => {
  assert.equal(addLocalDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addLocalDays("2026-03-01", -1), "2026-02-28");
  // Tuesday Nov 17 2026.
  assert.equal(weekStartDate("2026-11-17", 0), "2026-11-15");
  assert.equal(weekStartDate("2026-11-17", 1), "2026-11-16");
  assert.equal(weekStartDate("2026-11-15", 1), "2026-11-09");
  assert.deepEqual(weekDates("2026-11-15"), ["2026-11-15", "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21"]);
});

test("clock times convert both ways", () => {
  assert.equal(minuteOf("08:30"), 510);
  assert.equal(minuteOf("24:00"), null);
  assert.equal(minuteOf(""), null);
  assert.equal(timeOf(510), "08:30");
  assert.equal(timeOf(1440 + 120), "02:00");
  assert.equal(clockLabel(0), "12:00 AM");
  assert.equal(clockLabel(12 * 60 + 15), "12:15 PM");
});

test("a selection round-trips through the form, overnight included", () => {
  const day = { startsAt: { date: "2026-11-17", time: "08:00" }, endsAt: { date: "2026-11-17", time: "10:30" } };
  assert.deepEqual(selectionOf(day.startsAt, day.endsAt), { start: 480, end: 630 });
  assert.deepEqual(scheduleOf("2026-11-17", { start: 480, end: 630 }), day);
  const night = selectionOf({ date: "2026-11-17", time: "22:00" }, { date: "2026-11-18", time: "06:00" });
  assert.deepEqual(night, { start: 1320, end: 1800 });
  assert.deepEqual(scheduleOf("2026-11-17", night!), { startsAt: { date: "2026-11-17", time: "22:00" }, endsAt: { date: "2026-11-18", time: "06:00" } });
  // Ending exactly at midnight is the next date at 00:00.
  assert.deepEqual(scheduleOf("2026-11-17", { start: 1200, end: 1440 }).endsAt, { date: "2026-11-18", time: "00:00" });
  assert.equal(selectionOf({ date: "2026-11-17", time: "10:00" }, { date: "2026-11-17", time: "09:00" }), null);
  assert.equal(selectionOf({ date: "2026-11-17", time: "10:00" }, { date: "", time: "" }), null);
});

test("drawing, placing and moving snap to quarter hours and stay on the day", () => {
  assert.deepEqual(drawSelection(487, 620), { start: 480, end: 615 });
  assert.deepEqual(drawSelection(620, 487), { start: 480, end: 615 });
  assert.equal(drawSelection(480, 484), null);
  assert.deepEqual(drawSelection(1430, 1500), { start: 1425, end: 1440 });
  assert.deepEqual(placeSelection(1435, 120), { start: 1425, end: 1545 });
  assert.deepEqual(moveSelection({ start: 480, end: 630 }, -60), { start: 0, end: 150 });
  assert.deepEqual(moveSelection({ start: 480, end: 630 }, 1400), { start: 1395, end: 1545 });
});

test("handles keep a quarter hour between them and 24 hours at most", () => {
  const shift = { start: 480, end: 630 };
  assert.deepEqual(moveStart(shift, 700), { start: 615, end: 630 });
  assert.deepEqual(moveStart(shift, -30), { start: 0, end: 630 });
  assert.deepEqual(moveStart({ start: 1320, end: 1800 }, 200), { start: 360, end: 1800 });
  assert.deepEqual(moveEnd(shift, 400), { start: 480, end: 495 });
  assert.deepEqual(moveEnd(shift, 3000), { start: 480, end: 1920 });
  assert.equal(trackPercent(720), 50);
  assert.equal(trackPercent(2000), 100);
});

test("dayBlocks places the day's shifts and clips the ones crossing midnight", () => {
  const zone = "America/Chicago";
  const shifts = [
    // Mon Nov 16, 10 PM to Tue 2 AM local.
    { id: "a", jobName: "Sodexo", color: "#9486ff", startsAt: "2026-11-17T04:00:00.000Z", endsAt: "2026-11-17T08:00:00.000Z" },
    // Tue 8:00 to 10:30 AM.
    { id: "b", jobName: "Desk", color: "#32d583", startsAt: "2026-11-17T14:00:00.000Z", endsAt: "2026-11-17T16:30:00.000Z" },
    // Tue 8 PM to Wed 12 AM: ends at midnight, does not continue.
    { id: "c", jobName: "Desk", color: "#32d583", startsAt: "2026-11-18T02:00:00.000Z", endsAt: "2026-11-18T06:00:00.000Z" },
    // Wednesday: not on Tuesday's track.
    { id: "d", jobName: "Desk", color: "#32d583", startsAt: "2026-11-18T15:00:00.000Z", endsAt: "2026-11-18T17:00:00.000Z" },
  ];
  const blocks = dayBlocks("2026-11-17", shifts, zone);
  assert.deepEqual(blocks.map(({ id, start, end, fromBefore, continues }) => ({ id, start, end, fromBefore, continues })), [
    { id: "a", start: 0, end: 120, fromBefore: true, continues: false },
    { id: "b", start: 480, end: 630, fromBefore: false, continues: false },
    { id: "c", start: 1200, end: 1440, fromBefore: false, continues: false },
  ]);
  // The shift ending at Wednesday's midnight is not drawn on Wednesday.
  assert.deepEqual(dayBlocks("2026-11-18", shifts, zone).map((block) => block.id), ["d"]);
  assert.equal(overlapsBlock({ start: 630, end: 700 }, blocks), false);
  assert.equal(overlapsBlock({ start: 600, end: 700 }, blocks), true);
  assert.equal(overlapsBlock({ start: 1380, end: 1500 }, blocks), true);
});
