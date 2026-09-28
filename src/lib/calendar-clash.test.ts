import assert from "node:assert/strict";
import test from "node:test";
import { findClashes, normalizeGoogleEvent, type CalendarEvent } from "./calendar-clash";

const tz = "America/Chicago";
const timed = (id: string, startsAt: string, endsAt: string, extra: Partial<CalendarEvent> = {}): CalendarEvent => ({ id, calendarId: "primary", title: id, startsAt, endsAt, allDay: false, free: false, declined: false, ...extra });
const shift = { startsAt: "2026-09-28T19:00:00.000Z", endsAt: "2026-09-28T23:00:00.000Z" }; // 2–6 PM Chicago

test("flags an event that overlaps the shift", () => {
  const clashes = findClashes(shift, [timed("lab", "2026-09-28T20:00:00.000Z", "2026-09-28T21:30:00.000Z")]);
  assert.deepEqual(clashes.map((event) => event.id), ["lab"]);
});

test("back-to-back is not a clash, either side", () => {
  assert.equal(findClashes(shift, [timed("before", "2026-09-28T18:00:00.000Z", "2026-09-28T19:00:00.000Z"), timed("after", "2026-09-28T23:00:00.000Z", "2026-09-29T00:00:00.000Z")]).length, 0);
});

test("ignores all-day, free, and declined events", () => {
  const events = [
    timed("birthday", "2026-09-28T05:00:00.000Z", "2026-09-29T05:00:00.000Z", { allDay: true }),
    timed("hold", "2026-09-28T20:00:00.000Z", "2026-09-28T21:00:00.000Z", { free: true }),
    timed("nope", "2026-09-28T20:00:00.000Z", "2026-09-28T21:00:00.000Z", { declined: true }),
  ];
  assert.equal(findClashes(shift, events).length, 0);
});

test("an overnight shift clashes with an early-morning event", () => {
  const overnight = { startsAt: "2026-09-29T03:00:00.000Z", endsAt: "2026-09-29T11:00:00.000Z" }; // 10 PM – 6 AM
  assert.equal(findClashes(overnight, [timed("early", "2026-09-29T10:00:00.000Z", "2026-09-29T12:00:00.000Z")]).length, 1);
});

test("returns clashes in start order", () => {
  const clashes = findClashes(shift, [timed("b", "2026-09-28T21:00:00.000Z", "2026-09-28T22:00:00.000Z"), timed("a", "2026-09-28T19:30:00.000Z", "2026-09-28T20:00:00.000Z")]);
  assert.deepEqual(clashes.map((event) => event.id), ["a", "b"]);
});

test("normalises a timed event with an offset to UTC instants", () => {
  const event = normalizeGoogleEvent({ id: "x", summary: "Chem lab", start: { dateTime: "2026-09-28T14:00:00-05:00" }, end: { dateTime: "2026-09-28T15:30:00-05:00" } }, "primary", tz);
  assert.deepEqual(event, { id: "x", calendarId: "primary", title: "Chem lab", startsAt: "2026-09-28T19:00:00.000Z", endsAt: "2026-09-28T20:30:00.000Z", allDay: false, free: false, declined: false });
});

test("normalises an all-day event to local midnights in the viewer's zone", () => {
  const event = normalizeGoogleEvent({ id: "d", start: { date: "2026-09-28" }, end: { date: "2026-09-30" } }, "primary", tz);
  assert.equal(event?.allDay, true);
  assert.equal(event?.title, "(No title)");
  assert.equal(event?.startsAt, "2026-09-28T05:00:00.000Z");
  assert.equal(event?.endsAt, "2026-09-30T05:00:00.000Z");
});

test("reads free and declined, and drops cancelled or malformed events", () => {
  assert.equal(normalizeGoogleEvent({ id: "f", transparency: "transparent", start: { dateTime: "2026-09-28T14:00:00Z" }, end: { dateTime: "2026-09-28T15:00:00Z" } }, "primary", tz)?.free, true);
  assert.equal(normalizeGoogleEvent({ id: "n", attendees: [{ self: true, responseStatus: "declined" }], start: { dateTime: "2026-09-28T14:00:00Z" }, end: { dateTime: "2026-09-28T15:00:00Z" } }, "primary", tz)?.declined, true);
  assert.equal(normalizeGoogleEvent({ id: "c", status: "cancelled", start: { dateTime: "2026-09-28T14:00:00Z" }, end: { dateTime: "2026-09-28T15:00:00Z" } }, "primary", tz), null);
  assert.equal(normalizeGoogleEvent({ id: "m", start: {}, end: {} }, "primary", tz), null);
});
