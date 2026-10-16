import assert from "node:assert/strict";
import test from "node:test";
import { fillBuckets, lastUtcDays, lastUtcWeeks, shortUtcDate } from "./admin-usage";

test("lists the last days in UTC, oldest first, ending today", () => {
  // 01:30 UTC on the 16th is still the 15th in Chicago; the buckets follow UTC.
  assert.deepEqual(lastUtcDays(new Date("2026-10-16T01:30:00Z"), 3), ["2026-10-14", "2026-10-15", "2026-10-16"]);
});

test("lists ISO week starts (Mondays), ending with the current week", () => {
  // 2026-10-18 is a Sunday: its week began Monday the 12th.
  assert.deepEqual(lastUtcWeeks(new Date("2026-10-18T23:00:00Z"), 3), ["2026-09-28", "2026-10-05", "2026-10-12"]);
  // A Monday is the start of its own week.
  assert.deepEqual(lastUtcWeeks(new Date("2026-10-12T00:00:00Z"), 1), ["2026-10-12"]);
});

test("crosses a month boundary without skipping a day", () => {
  assert.deepEqual(lastUtcDays(new Date("2026-03-01T12:00:00Z"), 2), ["2026-02-28", "2026-03-01"]);
});

test("fills missing buckets with zero and ignores rows outside the range", () => {
  assert.deepEqual(fillBuckets(["a", "b", "c"], [{ bucket: "b", count: 4 }, { bucket: "z", count: 9 }]), [{ key: "a", count: 0 }, { key: "b", count: 4 }, { key: "c", count: 0 }]);
});

test("formats a UTC date key without shifting it by the server zone", () => {
  assert.equal(shortUtcDate("2026-10-01"), "Oct 1");
});
