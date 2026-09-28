import assert from "node:assert/strict";
import test from "node:test";
import type { CalendarEvent } from "./calendar-clash";
import { buildGlance, glanceWindow } from "./calendar-glance";

const tz = "America/Chicago";
const now = new Date("2026-09-28T15:00:00.000Z"); // Mon 10 AM Chicago
const ev = (id: string, startsAt: string, endsAt: string, allDay = false): CalendarEvent => ({ id, calendarId: "primary", title: id, startsAt, endsAt, allDay, free: false, declined: false });

test("window runs from now to the end of the seventh local day", () => {
  assert.deepEqual(glanceWindow(now, tz), { timeMin: "2026-09-28T15:00:00.000Z", timeMax: "2026-10-06T05:00:00.000Z" });
});

test("groups by local day with Today and Tomorrow labels, in order", () => {
  const { days } = buildGlance([ev("tue", "2026-09-29T14:00:00.000Z", "2026-09-29T15:00:00.000Z"), ev("mon", "2026-09-28T20:00:00.000Z", "2026-09-28T21:00:00.000Z"), ev("wed", "2026-09-30T14:00:00.000Z", "2026-09-30T15:00:00.000Z")], [], now, tz);
  assert.deepEqual(days.map((day) => day.label), ["Today", "Tomorrow", "Wed Sep 30"]);
});

test("a late-evening event groups under its local day, not its UTC day", () => {
  const { days } = buildGlance([ev("late", "2026-09-29T03:30:00.000Z", "2026-09-29T04:30:00.000Z")], [], now, tz); // Mon 10:30 PM
  assert.equal(days[0].label, "Today");
});

test("an all-day event lists on its day and a multi-day one only once, on its first visible day", () => {
  const { days } = buildGlance([ev("trip", "2026-09-27T05:00:00.000Z", "2026-09-30T05:00:00.000Z", true)], [], now, tz);
  assert.equal(days.length, 1);
  assert.equal(days[0].label, "Today");
});

test("marks events that overlap a shift, never all-day ones", () => {
  const shifts = [{ id: "s", jobName: "Campus desk", startsAt: "2026-09-28T19:00:00.000Z", endsAt: "2026-09-28T23:00:00.000Z" }];
  const { days } = buildGlance([ev("lab", "2026-09-28T20:00:00.000Z", "2026-09-28T21:00:00.000Z"), ev("bday", "2026-09-28T05:00:00.000Z", "2026-09-29T05:00:00.000Z", true)], shifts, now, tz);
  const rows = days[0].rows;
  assert.equal(rows.find((row) => row.event.id === "lab")?.overlapsJob, "Campus desk");
  assert.equal(rows.find((row) => row.event.id === "bday")?.overlapsJob, null);
});

test("caps the list and reports how many were hidden", () => {
  const many = Array.from({ length: 11 }, (_, index) => ev(`e${index}`, `2026-09-29T${String(10 + index).padStart(2, "0")}:00:00.000Z`, `2026-09-29T${String(10 + index).padStart(2, "0")}:30:00.000Z`));
  const { days, hidden } = buildGlance(many, [], now, tz, 8);
  assert.equal(days.flatMap((day) => day.rows).length, 8);
  assert.equal(hidden, 3);
});
