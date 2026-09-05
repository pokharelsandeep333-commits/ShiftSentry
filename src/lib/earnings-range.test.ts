import assert from "node:assert/strict";
import test from "node:test";
import { monthKeyLabel, monthKeyOf, monthKeysBetween, monthRangeForPreset, monthSpanLabel, selectMonths, shiftMonthKey } from "./earnings-range";

/** Jan through Aug 2026, the shape `bucketWorkedShiftsByMonth` produces. */
const MONTHS = monthKeysBetween("2026-01", "2026-08").map((key) => ({ key }));

test("month keys are read in the viewer zone, not the server one", () => {
  // 01:30 UTC on the first is still December in Chicago.
  assert.equal(monthKeyOf(new Date("2026-01-01T01:30:00Z"), "America/Chicago"), "2025-12");
  assert.equal(monthKeyOf(new Date("2026-01-01T01:30:00Z"), "UTC"), "2026-01");
});

test("shifting a month key crosses year boundaries in both directions", () => {
  assert.equal(shiftMonthKey("2026-01", -1), "2025-12");
  assert.equal(shiftMonthKey("2025-12", 1), "2026-01");
  assert.equal(shiftMonthKey("2026-08", -5), "2026-03");
});

test("monthKeysBetween is inclusive and empty when the pair is inverted", () => {
  assert.deepEqual(monthKeysBetween("2026-06", "2026-08"), ["2026-06", "2026-07", "2026-08"]);
  assert.deepEqual(monthKeysBetween("2026-08", "2026-08"), ["2026-08"]);
  assert.deepEqual(monthKeysBetween("2026-08", "2026-06"), []);
});

test("presets resolve against the month in progress", () => {
  assert.deepEqual(monthRangeForPreset("thisMonth", MONTHS), { from: "2026-08", to: "2026-08" });
  // Three months means the current one and the two before it, matching the chart.
  assert.deepEqual(monthRangeForPreset("last3", MONTHS), { from: "2026-06", to: "2026-08" });
  assert.deepEqual(monthRangeForPreset("last6", MONTHS), { from: "2026-03", to: "2026-08" });
  assert.deepEqual(monthRangeForPreset("yearToDate", MONTHS), { from: "2026-01", to: "2026-08" });
  assert.deepEqual(monthRangeForPreset("allTime", MONTHS), { from: "2026-01", to: "2026-08" });
});

test("a preset reaching past the first month worked is clamped to it", () => {
  const shortHistory = [{ key: "2026-07" }, { key: "2026-08" }];

  assert.deepEqual(monthRangeForPreset("last6", shortHistory), { from: "2026-07", to: "2026-08" });
  assert.deepEqual(monthRangeForPreset("yearToDate", shortHistory), { from: "2026-07", to: "2026-08" });
});

test("presets resolve to nothing when there is no history", () => {
  assert.equal(monthRangeForPreset("allTime", []), null);
  assert.equal(monthRangeForPreset("thisMonth", []), null);
});

test("selecting a span is inclusive and tolerates an inverted pair", () => {
  assert.deepEqual(selectMonths(MONTHS, "2026-03", "2026-05").map((month) => month.key), ["2026-03", "2026-04", "2026-05"]);
  assert.deepEqual(selectMonths(MONTHS, "2026-05", "2026-03").map((month) => month.key), ["2026-03", "2026-04", "2026-05"]);
  assert.deepEqual(selectMonths(MONTHS, "2026-04", "2026-04").map((month) => month.key), ["2026-04"]);
});

test("span labels print the year once within a year and twice across one", () => {
  assert.equal(monthKeyLabel("2026-03"), "Mar 2026");
  assert.equal(monthSpanLabel("2026-03", "2026-08"), "Mar – Aug 2026");
  assert.equal(monthSpanLabel("2026-08", "2026-03"), "Mar – Aug 2026");
  assert.equal(monthSpanLabel("2025-11", "2026-02"), "Nov 2025 – Feb 2026");
  assert.equal(monthSpanLabel("2026-04", "2026-04"), "Apr 2026");
});
