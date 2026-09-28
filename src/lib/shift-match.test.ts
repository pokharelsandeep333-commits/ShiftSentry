import assert from "node:assert/strict";
import test from "node:test";
import type { CalendarEvent } from "./calendar-clash";
import { isSameShift, matchEventsToShifts, suggestJob } from "./shift-match";

const event = (id: string, title: string, startsAt: string, endsAt: string, extra: Partial<CalendarEvent> = {}): CalendarEvent => ({ id, calendarId: "primary", title, startsAt, endsAt, allDay: false, free: false, declined: false, ...extra });
const shift = { id: "s1", jobName: "Campus desk", startsAt: "2026-09-28T19:00:00.000Z", endsAt: "2026-09-28T23:00:00.000Z" }; // 2–6 PM Chicago

test("the same span within 15 minutes is the same shift, whatever the title", () => {
  assert.equal(isSameShift(event("a", "Work", "2026-09-28T19:10:00.000Z", "2026-09-28T22:50:00.000Z"), shift), true);
  assert.equal(isSameShift(event("b", "Work", "2026-09-28T19:20:00.000Z", "2026-09-28T23:00:00.000Z"), shift), false);
});

test("an overlapping event titled with the job name is the same shift", () => {
  assert.equal(isSameShift(event("c", "campus DESK late", "2026-09-28T20:00:00.000Z", "2026-09-29T01:00:00.000Z"), shift), true);
  assert.equal(isSameShift(event("d", "Campus desk", "2026-09-29T19:00:00.000Z", "2026-09-29T23:00:00.000Z"), shift), false, "same title on another day is not this shift");
});

test("all-day and declined events are never a shift", () => {
  assert.equal(isSameShift(event("e", "Campus desk", "2026-09-28T05:00:00.000Z", "2026-09-29T05:00:00.000Z", { allDay: true }), shift), false);
  assert.equal(isSameShift(event("f", "Campus desk", shift.startsAt, shift.endsAt, { declined: true }), shift), false);
});

test("each event matches the closest shift, keyed by calendar and id", () => {
  const early = { id: "early", jobName: "River café", startsAt: "2026-09-28T19:05:00.000Z", endsAt: "2026-09-28T23:05:00.000Z" };
  const matches = matchEventsToShifts([event("g", "Work", "2026-09-28T19:00:00.000Z", "2026-09-28T23:00:00.000Z"), event("h", "Chem lab", "2026-09-28T20:00:00.000Z", "2026-09-28T21:00:00.000Z")], [early, shift]);
  assert.equal(matches.get("primary:g"), "s1");
  assert.equal(matches.has("primary:h"), false);
});

test("suggests the job whose name the title contains, preferring the longest name", () => {
  const jobs = [{ id: "j1", name: "Desk" }, { id: "j2", name: "Campus desk" }, { id: "j3", name: "Café" }];
  assert.equal(suggestJob(event("i", "Campus Desk shift", shift.startsAt, shift.endsAt), jobs)?.id, "j2");
  assert.equal(suggestJob(event("j", "Chem lab", shift.startsAt, shift.endsAt), jobs), null);
  assert.equal(suggestJob(event("k", "Campus desk", "2026-09-28T05:00:00.000Z", "2026-09-29T05:00:00.000Z", { allDay: true }), jobs), null);
});

test("a job's Google keyword replaces its name for recognition and suggestions", () => {
  const keyed = { ...shift, keyword: "Work" };
  assert.equal(isSameShift(event("w", "Work", "2026-09-28T20:00:00.000Z", "2026-09-29T01:00:00.000Z"), keyed), true);
  assert.equal(isSameShift(event("n", "Campus desk", "2026-09-28T20:00:00.000Z", "2026-09-29T01:00:00.000Z"), keyed), false);
  assert.equal(suggestJob(event("s", "Work shift", shift.startsAt, shift.endsAt), [{ id: "j", name: "Campus desk", keyword: "Work" }])?.id, "j");
});
