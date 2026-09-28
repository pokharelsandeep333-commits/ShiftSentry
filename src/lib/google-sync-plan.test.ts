import assert from "node:assert/strict";
import test from "node:test";
import type { CalendarEvent } from "./calendar-clash";
import { jobForEvent, planShiftSync, resolveMissing, type LinkedShift, type SyncJob } from "./google-sync-plan";

const now = new Date("2026-09-28T12:00:00.000Z");
const job = (extra: Partial<SyncJob> = {}): SyncJob => ({ id: "campus", name: "Campus desk", keyword: null, calendarId: null, sync: true, ignored: [], ...extra });
const event = (id: string, title: string, startsAt: string, endsAt: string, extra: Partial<CalendarEvent> = {}): CalendarEvent => ({ id, calendarId: "primary", title, startsAt, endsAt, allDay: false, free: false, declined: false, ...extra });
const shift = (id: string, startsAt: string, endsAt: string, extra: Partial<LinkedShift> = {}): LinkedShift => ({ id, jobId: "campus", startsAt, endsAt, calendarId: null, eventId: null, adopted: false, ...extra });
const plan = (input: Partial<Parameters<typeof planShiftSync>[0]>) => planShiftSync({ events: [], jobs: [job()], shifts: [], selectedCalendarIds: ["primary"], failedCalendarIds: [], now, ...input });
const future = { startsAt: "2026-10-01T14:00:00.000Z", endsAt: "2026-10-01T18:00:00.000Z" };
const linked = (id: string, eventId: string, extra: Partial<LinkedShift> = {}) => shift(id, future.startsAt, future.endsAt, { calendarId: "primary", eventId, ...extra });

test("a new event for a synced job becomes a shift", () => {
  const result = plan({ events: [event("e1", "Campus desk", future.startsAt, future.endsAt)] });
  assert.deepEqual(result.create, [{ jobId: "campus", ...future, calendarId: "primary", eventId: "e1" }]);
  assert.deepEqual([result.adopt, result.update, result.relink, result.verify, result.issues], [[], [], [], [], []]);
});

test("a shift already typed in by hand is adopted, not duplicated -- and only by its own job", () => {
  const typed = shift("manual", "2026-10-01T14:10:00.000Z", "2026-10-01T18:00:00.000Z");
  const result = plan({ events: [event("e1", "Campus desk", future.startsAt, future.endsAt)], shifts: [typed] });
  assert.deepEqual(result.adopt, [{ shiftId: "manual", calendarId: "primary", eventId: "e1", jobId: "campus", startsAt: typed.startsAt, endsAt: typed.endsAt }]);
  assert.equal(result.create.length, 0);
  const otherJob = plan({ events: [event("e1", "Campus desk", future.startsAt, future.endsAt)], shifts: [{ ...typed, jobId: "cafe" }] });
  assert.deepEqual([otherJob.adopt.length, otherJob.create.length], [0, 1]);
});

test("an upcoming synced shift follows its event, including a change of job", () => {
  const moved = event("e1", "River café", "2026-10-01T15:00:00.000Z", "2026-10-01T19:00:00.000Z");
  const result = plan({ jobs: [job(), job({ id: "cafe", name: "River café" })], events: [moved], shifts: [linked("s1", "e1")] });
  assert.deepEqual(result.update, [{ shiftId: "s1", jobId: "cafe", startsAt: moved.startsAt, endsAt: moved.endsAt }]);
});

test("a synced shift that has started is never touched, whether its event moved or vanished", () => {
  const started = shift("s2", "2026-09-28T10:00:00.000Z", "2026-09-28T15:00:00.000Z", { calendarId: "primary", eventId: "e2" });
  const moved = plan({ events: [event("e2", "Campus desk", "2026-09-28T11:00:00.000Z", "2026-09-28T16:00:00.000Z")], shifts: [started] });
  const vanished = plan({ shifts: [started] });
  assert.deepEqual([moved.update, moved.verify, vanished.verify], [[], [], []]);
});

test("an upcoming synced shift missing from this fetch is checked with Google, never removed on sight", () => {
  assert.deepEqual(plan({ shifts: [linked("s1", "gone")] }).verify, [{ shiftId: "s1", calendarId: "primary", eventId: "gone", jobId: "campus", adopted: false, startsAt: future.startsAt, endsAt: future.endsAt }]);
  assert.deepEqual(plan({ shifts: [linked("s1", "gone")], failedCalendarIds: ["primary"] }).verify, []);
});

test("a republished event re-links to the shift of the one it replaced, keeping the shift", () => {
  const result = plan({ events: [event("new-id", "Campus desk", future.startsAt, future.endsAt)], shifts: [linked("s1", "old-id")] });
  assert.deepEqual(result.relink, [{ shiftId: "s1", calendarId: "primary", eventId: "new-id", jobId: "campus", startsAt: future.startsAt, endsAt: future.endsAt }]);
  assert.deepEqual([result.create, result.verify], [[], []]);
});

test("an event the user deleted here stays deleted, whichever calendar copy it arrives on", () => {
  assert.equal(plan({ jobs: [job({ ignored: ["work:e1"] })], events: [event("e1", "Campus desk", future.startsAt, future.endsAt)] }).create.length, 0);
  const ignoredTwin = plan({ jobs: [job({ ignored: ["primary:e1"] })], events: [event("e1", "Campus desk", future.startsAt, future.endsAt)], shifts: [shift("manual", future.startsAt, future.endsAt)] });
  assert.equal(ignoredTwin.adopt.length, 0);
});

test("an event longer than 24 hours is reported, not created", () => {
  const result = plan({ events: [event("long", "Campus desk", "2026-10-01T00:00:00.000Z", "2026-10-02T01:00:00.000Z")] });
  assert.equal(result.create.length, 0);
  assert.deepEqual(result.issues, [{ jobName: "Campus desk", startsAt: "2026-10-01T00:00:00.000Z", endsAt: "2026-10-02T01:00:00.000Z", reason: "longer than 24 hours" }]);
});

test("keywords match whole words, longest wins, a calendar restriction holds", () => {
  const ta = [job({ id: "ta", name: "TA" })];
  assert.equal(jobForEvent(event("a", "Statistics lecture", future.startsAt, future.endsAt), ta, ["primary"]), null);
  assert.equal(jobForEvent(event("b", "Italian 101", future.startsAt, future.endsAt), ta, ["primary"]), null);
  assert.equal(jobForEvent(event("c", "TA shift (CS 101)", future.startsAt, future.endsAt), ta, ["primary"])?.id, "ta");
  assert.equal(jobForEvent(event("d", "A", future.startsAt, future.endsAt), [job({ keyword: "A" })], ["primary"]), null, "one-letter keywords never match");
  const jobs = [job({ id: "shift", name: "Any", keyword: "Shift" }), job({ id: "campus", keyword: "Campus" })];
  assert.equal(jobForEvent(event("e", "Shift - Campus", future.startsAt, future.endsAt), jobs, ["primary"])?.id, "campus");
  const workOnly = [job({ calendarId: "work", keyword: "Campus" })];
  assert.equal(jobForEvent(event("f", "Campus", future.startsAt, future.endsAt), workOnly, ["primary", "work"]), null);
  assert.equal(jobForEvent(event("g", "Campus", future.startsAt, future.endsAt, { calendarId: "work" }), workOnly, ["primary"])?.id, "campus");
  assert.equal(plan({ jobs: [job({ sync: false })], events: [event("h", "Campus desk", future.startsAt, future.endsAt)] }).create.length, 0);
});

test("an invite on two calendars is read from the copy on the job's own calendar", () => {
  const onPrimary = event("inv", "Campus desk", future.startsAt, future.endsAt);
  const onWork = { ...onPrimary, calendarId: "work" };
  const result = plan({ jobs: [job({ calendarId: "work" })], selectedCalendarIds: ["primary"], events: [onPrimary, onWork] });
  assert.deepEqual(result.create.map((item) => item.calendarId), ["work"]);
});

test("a linked shift whose job no longer syncs is left alone by the planner", () => {
  assert.deepEqual(plan({ jobs: [job({ sync: false })], shifts: [linked("s1", "gone")] }).verify, []);
});

test("resolving a missing event: gone deletes (or unlinks a hand-typed shift), alive follows or unlinks", () => {
  const pending = { shiftId: "s1", calendarId: "primary", eventId: "e1", jobId: "campus", adopted: false, startsAt: future.startsAt, endsAt: future.endsAt };
  const jobs = [job()];
  assert.deepEqual(resolveMissing(pending, "gone", jobs, ["primary"]), { action: "delete" });
  assert.deepEqual(resolveMissing({ ...pending, adopted: true }, "gone", jobs, ["primary"]), { action: "detach" });
  const later = event("e1", "Campus desk", "2026-12-01T14:00:00.000Z", "2026-12-01T18:00:00.000Z");
  assert.deepEqual(resolveMissing(pending, later, jobs, ["primary"]), { action: "update", jobId: "campus", startsAt: later.startsAt, endsAt: later.endsAt });
  assert.deepEqual(resolveMissing(pending, { ...later, title: "Dentist" }, jobs, ["primary"]), { action: "detach" });
  assert.deepEqual(resolveMissing(pending, later, jobs, []), { action: "detach" }, "calendar unticked: keep the shift, stop following");
  assert.deepEqual(resolveMissing(pending, { ...later, declined: true }, jobs, ["primary"]), { action: "delete" });
});
