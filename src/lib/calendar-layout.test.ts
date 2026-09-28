import assert from "node:assert/strict";
import test from "node:test";
import type { CalendarEvent } from "./calendar-clash";
import { buildCalendarItems, itemsOnDay, layoutDay, type CalendarItem } from "./calendar-layout";

const tz = "America/Chicago";
const item = (key: string, startsAt: string, endsAt: string, allDay = false): CalendarItem => ({ key, kind: "event", title: key, startsAt, endsAt, allDay, color: "#000", href: null, overlap: false });
const event = (id: string, startsAt: string, endsAt: string, extra: Partial<CalendarEvent> = {}): CalendarEvent => ({ id, calendarId: "primary", title: id, startsAt, endsAt, allDay: false, free: false, declined: false, ...extra });

test("overlapping items share the width in lanes; a later one gets the full width", () => {
  const placed = layoutDay([
    item("a", "2026-09-28T14:00:00.000Z", "2026-09-28T16:00:00.000Z"),
    item("b", "2026-09-28T15:00:00.000Z", "2026-09-28T17:00:00.000Z"),
    item("c", "2026-09-28T19:00:00.000Z", "2026-09-28T20:00:00.000Z"),
  ], "2026-09-28", tz);
  const by = Object.fromEntries(placed.map((p) => [p.item.key, p]));
  assert.deepEqual([by.a.lane, by.a.lanes, by.b.lane, by.b.lanes], [0, 2, 1, 2]);
  assert.deepEqual([by.c.lane, by.c.lanes], [0, 1]);
  assert.equal(by.a.top, 9 * 60);
  assert.equal(by.a.height, 120);
});

test("back-to-back items stay in one lane", () => {
  const placed = layoutDay([item("a", "2026-09-28T14:00:00.000Z", "2026-09-28T15:00:00.000Z"), item("b", "2026-09-28T15:00:00.000Z", "2026-09-28T16:00:00.000Z")], "2026-09-28", tz);
  assert.deepEqual(placed.map((p) => [p.lane, p.lanes]), [[0, 1], [0, 1]]);
});

test("an overnight shift is drawn on both days, clipped at local midnight", () => {
  const overnight = item("n", "2026-09-29T03:00:00.000Z", "2026-09-29T11:00:00.000Z"); // Mon 10 PM – Tue 6 AM
  const monday = layoutDay([overnight], "2026-09-28", tz)[0];
  const tuesday = layoutDay([overnight], "2026-09-29", tz)[0];
  assert.deepEqual([monday.top, monday.height], [22 * 60, 120]);
  assert.deepEqual([tuesday.top, tuesday.height], [0, 360]);
});

test("itemsOnDay puts all-day items first; layoutDay places only timed ones", () => {
  const items = [item("timed", "2026-09-28T14:00:00.000Z", "2026-09-28T15:00:00.000Z"), item("allday", "2026-09-28T05:00:00.000Z", "2026-09-29T05:00:00.000Z", true)];
  assert.deepEqual(itemsOnDay(items, "2026-09-28", tz).map((i) => i.key), ["allday", "timed"]);
  assert.equal(itemsOnDay(items, "2026-09-29", tz).length, 0);
  assert.equal(layoutDay(items, "2026-09-28", tz).length, 1);
});

test("buildCalendarItems marks both sides of a clash and drops declined events", () => {
  const items = buildCalendarItems(
    [{ id: "s1", jobName: "Campus desk", color: "#9486ff", startsAt: "2026-09-28T19:00:00.000Z", endsAt: "2026-09-28T23:00:00.000Z" }],
    [event("lab", "2026-09-28T20:00:00.000Z", "2026-09-28T21:00:00.000Z"), event("bday", "2026-09-28T05:00:00.000Z", "2026-09-29T05:00:00.000Z", { allDay: true }), event("no", "2026-09-28T20:00:00.000Z", "2026-09-28T21:00:00.000Z", { declined: true })],
    new Map([["primary", "#33b679"]]),
  );
  const by = Object.fromEntries(items.map((i) => [i.key, i]));
  assert.equal(by["shift:s1"].overlap, true);
  assert.equal(by["shift:s1"].href, "/shifts/s1/edit");
  assert.equal(by["event:primary:lab"].overlap, true);
  assert.equal(by["event:primary:lab"].color, "#33b679");
  assert.equal(by["event:primary:bday"].overlap, false);
  assert.equal(by["event:primary:no"], undefined);
});
