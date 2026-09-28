import assert from "node:assert/strict";
import test from "node:test";
import type { CalendarEvent } from "./calendar-clash";
import { buildCalendarItems, itemsOnDay, layoutDay, type CalendarItem } from "./calendar-layout";

const tz = "America/Chicago";
const item = (key: string, startsAt: string, endsAt: string, allDay = false): CalendarItem => ({ key, kind: "event", title: key, startsAt, endsAt, allDay, color: "#000", href: null, overlap: false, alsoInGoogle: false, importHref: null, importJob: null });
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

test("on daylight-saving days items sit at their wall-clock hour", () => {
  const spring = layoutDay([item("s", "2026-03-08T14:00:00.000Z", "2026-03-08T22:00:00.000Z")], "2026-03-08", tz)[0]; // 9 AM – 5 PM CDT
  assert.deepEqual([spring.top, spring.height], [9 * 60, 8 * 60]);
  const fall = layoutDay([item("f", "2026-11-01T15:00:00.000Z", "2026-11-01T23:00:00.000Z")], "2026-11-01", tz)[0]; // 9 AM – 5 PM CST
  assert.deepEqual([fall.top, fall.height], [9 * 60, 8 * 60]);
  const late = layoutDay([item("l", "2026-11-02T05:00:00.000Z", "2026-11-02T05:30:00.000Z")], "2026-11-01", tz)[0]; // 11 – 11:30 PM CST
  assert.deepEqual([late.top, late.height], [23 * 60, 30]);
});

test("a Google copy of a shift is merged into the shift and never clashes with it", () => {
  const items = buildCalendarItems(
    [{ id: "s1", jobName: "Campus desk", color: "#9486ff", startsAt: "2026-09-28T19:00:00.000Z", endsAt: "2026-09-28T23:00:00.000Z" }],
    [event("copy", "2026-09-28T19:00:00.000Z", "2026-09-28T23:00:00.000Z", { title: "Work" })],
    new Map(),
  );
  assert.deepEqual(items.map((i) => i.key), ["shift:s1"]);
  assert.equal(items[0].alsoInGoogle, true);
  assert.equal(items[0].overlap, false);
});

test("a Google event named for a job, with no shift yet, offers to be added as that job", () => {
  const items = buildCalendarItems([], [event("sat", "2026-10-03T15:00:00.000Z", "2026-10-03T20:00:00.000Z", { title: "River café shift" })], new Map(), { jobs: [{ id: "j-cafe", name: "River café" }], timeZone: tz });
  assert.equal(items[0].importJob, "River café");
  assert.equal(items[0].importHref, "/shifts/new?jobId=j-cafe&startsAt=2026-10-03T10%3A00&endsAt=2026-10-03T15%3A00");
  assert.equal(buildCalendarItems([], [event("lab", "2026-10-03T15:00:00.000Z", "2026-10-03T20:00:00.000Z")], new Map(), { jobs: [{ id: "j-cafe", name: "River café" }], timeZone: tz })[0].importHref, null);
});
