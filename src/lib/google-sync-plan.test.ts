import assert from "node:assert/strict";
import test from "node:test";
import type { CalendarEvent } from "./calendar-clash";
import { jobForEvent, planShiftSync, type LinkedShift, type SyncJob } from "./google-sync-plan";

const now = new Date("2026-09-28T12:00:00.000Z");
const job = (extra: Partial<SyncJob> = {}): SyncJob => ({ id: "campus", name: "Campus desk", keyword: null, calendarId: null, sync: true, ignored: [], ...extra });
const event = (id: string, title: string, startsAt: string, endsAt: string, extra: Partial<CalendarEvent> = {}): CalendarEvent => ({ id, calendarId: "primary", title, startsAt, endsAt, allDay: false, free: false, declined: false, ...extra });
const shift = (id: string, startsAt: string, endsAt: string, extra: Partial<LinkedShift> = {}): LinkedShift => ({ id, jobId: "campus", startsAt, endsAt, calendarId: null, eventId: null, ...extra });
const plan = (input: Partial<Parameters<typeof planShiftSync>[0]>) => planShiftSync({ events: [], jobs: [job()], shifts: [], selectedCalendarIds: ["primary"], failedCalendarIds: [], now, ...input });
const future = { startsAt: "2026-10-01T14:00:00.000Z", endsAt: "2026-10-01T18:00:00.000Z" };

test("a new event for a synced job becomes a shift", () => {
  const result = plan({ events: [event("e1", "Campus desk", future.startsAt, future.endsAt)] });
  assert.deepEqual(result.create, [{ jobId: "campus", ...future, calendarId: "primary", eventId: "e1" }]);
  assert.deepEqual([result.adopt, result.update, result.remove, result.issues], [[], [], [], []]);
});

test("a shift already typed in by hand is adopted, not duplicated", () => {
  const result = plan({ events: [event("e1", "Campus desk", future.startsAt, future.endsAt)], shifts: [shift("manual", "2026-10-01T14:10:00.000Z", "2026-10-01T18:00:00.000Z")] });
  assert.deepEqual(result.adopt, [{ shiftId: "manual", calendarId: "primary", eventId: "e1" }]);
  assert.equal(result.create.length, 0);
});

test("an upcoming synced shift follows its event; one that has started stays put", () => {
  const moved = event("e1", "Campus desk", "2026-10-01T15:00:00.000Z", "2026-10-01T19:00:00.000Z");
  const upcoming = plan({ events: [moved], shifts: [shift("s1", future.startsAt, future.endsAt, { calendarId: "primary", eventId: "e1" })] });
  assert.deepEqual(upcoming.update, [{ shiftId: "s1", jobId: "campus", startsAt: moved.startsAt, endsAt: moved.endsAt }]);
  const started = plan({ events: [event("e2", "Campus desk", "2026-09-28T11:00:00.000Z", "2026-09-28T16:00:00.000Z")], shifts: [shift("s2", "2026-09-28T10:00:00.000Z", "2026-09-28T15:00:00.000Z", { calendarId: "primary", eventId: "e2" })] });
  assert.deepEqual([started.update, started.remove, started.create], [[], [], []]);
});

test("an upcoming synced shift whose event is gone is removed, unless its calendar failed to load", () => {
  const linked = [shift("s1", future.startsAt, future.endsAt, { calendarId: "primary", eventId: "gone" })];
  assert.deepEqual(plan({ shifts: linked }).remove, ["s1"]);
  assert.deepEqual(plan({ shifts: linked, failedCalendarIds: ["primary"] }).remove, []);
});

test("an event the user deleted in ShiftSentry is not brought back", () => {
  assert.equal(plan({ jobs: [job({ ignored: ["primary:e1"] })], events: [event("e1", "Campus desk", future.startsAt, future.endsAt)] }).create.length, 0);
});

test("an event longer than 24 hours is reported, not created", () => {
  const result = plan({ events: [event("long", "Campus desk", "2026-10-01T00:00:00.000Z", "2026-10-02T01:00:00.000Z")] });
  assert.equal(result.create.length, 0);
  assert.deepEqual(result.issues, [{ jobName: "Campus desk", startsAt: "2026-10-01T00:00:00.000Z", endsAt: "2026-10-02T01:00:00.000Z", reason: "longer than 24 hours" }]);
});

test("keywords decide the job: longest wins, a calendar restriction holds, sync off means nothing", () => {
  const jobs = [job({ id: "shift", name: "Any", keyword: "Shift" }), job({ id: "campus", keyword: "Campus" })];
  assert.equal(jobForEvent(event("a", "Shift - Campus", future.startsAt, future.endsAt), jobs, ["primary"])?.id, "campus");
  const workOnly = [job({ calendarId: "work", keyword: "Campus" })];
  assert.equal(jobForEvent(event("b", "Campus", future.startsAt, future.endsAt), workOnly, ["primary", "work"]), null);
  assert.equal(jobForEvent(event("c", "Campus", future.startsAt, future.endsAt, { calendarId: "work" }), workOnly, ["primary"])?.id, "campus");
  assert.equal(jobForEvent(event("d", "Campus desk", future.startsAt, future.endsAt, { allDay: true }), [job()], ["primary"]), null);
  assert.equal(plan({ jobs: [job({ sync: false })], events: [event("e", "Campus desk", future.startsAt, future.endsAt)] }).create.length, 0);
});

test("a linked shift whose job no longer syncs is left alone by the planner", () => {
  const linked = [shift("s1", future.startsAt, future.endsAt, { calendarId: "primary", eventId: "gone" })];
  assert.deepEqual(plan({ jobs: [job({ sync: false })], shifts: linked }).remove, []);
});
