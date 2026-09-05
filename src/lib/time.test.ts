import assert from "node:assert/strict";
import { test } from "node:test";
import { allocateShiftMinutes, percentage, weekEndFor, weekStartFor } from "@/lib/time";

const CHICAGO = "America/Chicago";

function totalMinutes(startsAt: Date, endsAt: Date) {
  return Math.round((endsAt.getTime() - startsAt.getTime()) / 60_000);
}

test("a shift inside one local day produces a single allocation", () => {
  const startsAt = new Date("2026-06-15T14:00:00Z"); // 09:00 CDT
  const endsAt = new Date("2026-06-15T22:00:00Z"); // 17:00 CDT
  assert.deepEqual(allocateShiftMinutes(startsAt, endsAt, CHICAGO), [{ date: "2026-06-15", minutes: 480 }]);
});

test("an overnight shift splits at local midnight", () => {
  const startsAt = new Date("2026-06-16T03:00:00Z"); // 22:00 CDT on the 15th
  const endsAt = new Date("2026-06-16T11:00:00Z"); // 06:00 CDT on the 16th
  assert.deepEqual(allocateShiftMinutes(startsAt, endsAt, CHICAGO), [
    { date: "2026-06-15", minutes: 120 },
    { date: "2026-06-16", minutes: 360 },
  ]);
});

// 2026-03-08 is the US spring-forward date: 02:00 local becomes 03:00, so a
// 22:00-06:00 shift is seven real hours, not eight. Allocation must report the
// hours actually worked, or the shift bills an hour nobody was there for and
// spends an hour of weekly cap that was never used.
test("a shift across spring forward loses the skipped hour", () => {
  const startsAt = new Date("2026-03-08T04:00:00Z"); // 22:00 CST on the 7th
  const endsAt = new Date("2026-03-08T11:00:00Z"); // 06:00 CDT on the 8th
  const allocations = allocateShiftMinutes(startsAt, endsAt, CHICAGO);
  assert.deepEqual(allocations, [
    { date: "2026-03-07", minutes: 120 },
    { date: "2026-03-08", minutes: 300 },
  ]);
  assert.equal(allocations.reduce((sum, a) => sum + a.minutes, 0), totalMinutes(startsAt, endsAt));
});

// 2026-11-01 is the fall-back date: 02:00 local happens twice, so the same
// wall-clock span is nine real hours.
test("a shift across fall back gains the repeated hour", () => {
  const startsAt = new Date("2026-11-01T03:00:00Z"); // 22:00 CDT on Oct 31
  const endsAt = new Date("2026-11-01T12:00:00Z"); // 06:00 CST on Nov 1
  const allocations = allocateShiftMinutes(startsAt, endsAt, CHICAGO);
  assert.deepEqual(allocations, [
    { date: "2026-10-31", minutes: 120 },
    { date: "2026-11-01", minutes: 420 },
  ]);
  assert.equal(allocations.reduce((sum, a) => sum + a.minutes, 0), totalMinutes(startsAt, endsAt));
});

test("allocation preserves the exact duration of a multi-day shift", () => {
  const startsAt = new Date("2026-06-15T20:00:00Z");
  const endsAt = new Date("2026-06-17T05:30:00Z");
  const allocations = allocateShiftMinutes(startsAt, endsAt, CHICAGO);
  assert.equal(allocations.reduce((sum, a) => sum + a.minutes, 0), totalMinutes(startsAt, endsAt));
  assert.deepEqual(allocations.map((a) => a.date), ["2026-06-15", "2026-06-16", "2026-06-17"]);
});

test("weekStartFor honours the profile's first day of the week", () => {
  const thursday = new Date("2026-06-18T15:00:00Z"); // 10:00 CDT Thursday
  // Sunday-start weeks begin on the 14th; Monday-start weeks on the 15th.
  assert.equal(weekStartFor(thursday, CHICAGO, 0).toISOString(), "2026-06-14T05:00:00.000Z");
  assert.equal(weekStartFor(thursday, CHICAGO, 1).toISOString(), "2026-06-15T05:00:00.000Z");
});

test("weekStartFor resolves to local midnight, not UTC midnight", () => {
  const winter = new Date("2026-01-15T15:00:00Z"); // 09:00 CST Thursday
  // 2026-01-11 00:00 CST is 06:00 UTC -- an hour later than the summer offset.
  assert.equal(weekStartFor(winter, CHICAGO, 0).toISOString(), "2026-01-11T06:00:00.000Z");
});

test("an instant just before local midnight belongs to the outgoing week", () => {
  const lateSaturday = new Date("2026-06-14T04:59:00Z"); // 23:59 CDT Saturday the 13th
  assert.equal(weekStartFor(lateSaturday, CHICAGO, 0).toISOString(), "2026-06-07T05:00:00.000Z");
  const earlySunday = new Date("2026-06-14T05:01:00Z"); // 00:01 CDT Sunday the 14th
  assert.equal(weekStartFor(earlySunday, CHICAGO, 0).toISOString(), "2026-06-14T05:00:00.000Z");
});

// weekEndFor bounds the dashboard's "this week" query and decides which shifts
// count as upcoming. It must land on the next week's local midnight even when
// the week contains a DST transition, where seven local days are not 168 hours.
test("weekEndFor lands on the next local midnight across spring forward", () => {
  const inDstWeek = new Date("2026-03-11T15:00:00Z"); // Wednesday of the spring-forward week
  const start = weekStartFor(inDstWeek, CHICAGO, 0);
  assert.equal(start.toISOString(), "2026-03-08T06:00:00.000Z");
  assert.equal(weekEndFor(inDstWeek, CHICAGO, 0).toISOString(), "2026-03-15T05:00:00.000Z");
});

test("weekEndFor lands on the next local midnight across fall back", () => {
  const inDstWeek = new Date("2026-10-28T15:00:00Z"); // Wednesday of the fall-back week
  const start = weekStartFor(inDstWeek, CHICAGO, 0);
  assert.equal(start.toISOString(), "2026-10-25T05:00:00.000Z");
  assert.equal(weekEndFor(inDstWeek, CHICAGO, 0).toISOString(), "2026-11-01T05:00:00.000Z");
});

test("weekEndFor is the start of the following week", () => {
  const anyDay = new Date("2026-06-18T15:00:00Z");
  const nextWeek = new Date("2026-06-25T15:00:00Z");
  assert.equal(weekEndFor(anyDay, CHICAGO, 0).getTime(), weekStartFor(nextWeek, CHICAGO, 0).getTime());
});

test("percentage rounds and treats a missing limit as zero", () => {
  assert.equal(percentage(600, 1200), 50);
  assert.equal(percentage(719, 1200), 60);
  assert.equal(percentage(600, null), 0);
});
