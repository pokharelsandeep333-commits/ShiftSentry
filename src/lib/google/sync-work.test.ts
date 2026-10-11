import assert from "node:assert/strict";
import test from "node:test";
import { GoogleAuthError, listEventsForSync } from "./client";
import { readSyncWork } from "./sync-work";
import { SyncBudget, SyncBudgetExceeded, SYNC_LIMITS } from "./sync-budget";
import type { LinkedShift, SyncJob } from "../google-sync-plan";

const now = new Date("2026-10-01T00:00:00Z");
const range = { timeMin: now.toISOString(), timeMax: "2026-11-01T00:00:00Z" };
const job: SyncJob = { id: "job", name: "Campus desk", keyword: null, calendarId: "primary", sync: true, ignored: [] };
const linked = (id: number, adopted = false): LinkedShift => ({
  id: String(id), jobId: job.id, startsAt: "2026-10-02T12:00:00Z", endsAt: "2026-10-02T13:00:00Z",
  calendarId: "primary", eventId: String(id), adopted,
});
const read = (shifts: LinkedShift[] = [], jobs = [job], budget?: SyncBudget) =>
  readSyncWork("test-token", ["primary"], jobs, shifts, range, "UTC", now, budget);

test("job calendar IDs cannot expand a sync past the calendar budget", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; return Response.json({ items: [] }); });
  await assert.rejects(read([], Array.from({ length: 500 }, (_, id) => ({ ...job, id: String(id), calendarId: String(id) }))), SyncBudgetExceeded);
  assert.equal(calls, 0);
});

test("allowed calendars are deduplicated and fetched with at most four requests in flight", async (t) => {
  let active = 0, peak = 0, calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++; peak = Math.max(peak, ++active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active--;
    return Response.json({ items: [] });
  });
  const ids = Array.from({ length: 25 }, (_, id) => String(id));
  const result = await listEventsForSync("test-token", [...ids, ...ids], range, "UTC");
  assert.equal(calls, 25);
  assert.ok(peak <= SYNC_LIMITS.concurrency);
  assert.deepEqual(result, { events: [], failedCalendarIds: [] });
});

test("pagination across calendars shares the same request budget", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => { calls++; return Response.json({ items: [], nextPageToken: "more" }); });
  await assert.rejects(listEventsForSync("test-token", Array.from({ length: 25 }, (_, id) => String(id)), range, "UTC"), SyncBudgetExceeded);
  assert.equal(calls, SYNC_LIMITS.requests);
});

test("even filtered events count toward the aggregate response budget", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async () => {
    calls++;
    return Response.json({ items: Array.from({ length: 250 }, () => ({ status: "cancelled" })), nextPageToken: "more" });
  });
  await assert.rejects(listEventsForSync("test-token", ["primary", "other"], range, "UTC"), SyncBudgetExceeded);
  assert.ok(calls <= SYNC_LIMITS.requests);
});

test("missing-event verification cannot bypass the shared request budget or return a partial plan", async (t) => {
  let calls = 0;
  t.mock.method(globalThis, "fetch", async (url: URL) => {
    calls++;
    return String(url).includes("/events/") ? new Response(null, { status: 404 }) : Response.json({ items: [] });
  });
  const shifts = Array.from({ length: 60 }, (_, id) => linked(id));
  const before = structuredClone(shifts);
  await assert.rejects(read(shifts), SyncBudgetExceeded);
  assert.equal(calls, SYNC_LIMITS.requests);
  assert.deepEqual(shifts, before);
});

test("ordinary missing events delete generated shifts and detach adopted shifts; unreadable events stay", async (t) => {
  t.mock.method(globalThis, "fetch", async (url: URL) => {
    if (String(url).includes("/events/2")) throw new Error("network unavailable");
    return String(url).includes("/events/") ? new Response(null, { status: 410 }) : Response.json({ items: [] });
  });
  const result = await read([linked(0), linked(1, true), linked(2)]);
  assert.deepEqual(result.resolved.map(({ resolution }) => resolution.action), ["delete", "detach", "keep"]);
});

test("oversized write plans are rejected before application while ordinary events still create shifts", async (t) => {
  let count = 201;
  t.mock.method(globalThis, "fetch", async () => Response.json({ items: Array.from({ length: count }, (_, id) => ({
    id: String(id), summary: job.name,
    start: { dateTime: "2026-10-02T12:00:00Z" }, end: { dateTime: "2026-10-02T13:00:00Z" },
  })) }));
  await assert.rejects(read(), SyncBudgetExceeded);
  count = 1;
  assert.equal((await read()).plan.create.length, 1);
});

test("the shared deadline covers responses and database operation signals", async (t) => {
  let time = 0;
  const budget = new SyncBudget(() => time);
  t.mock.method(globalThis, "fetch", async () => { time = SYNC_LIMITS.durationMs; return Response.json({ items: [] }); });
  await assert.rejects(read([], [job], budget), SyncBudgetExceeded);
  assert.throws(() => budget.operationSignal(), SyncBudgetExceeded);
});

test("an authentication error still fails the whole snapshot", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 401 }));
  await assert.rejects(read(), GoogleAuthError);
});
