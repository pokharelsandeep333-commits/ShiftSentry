import assert from "node:assert/strict";
import test from "node:test";
import { niceAxisTicks } from "./chart-ticks";

test("hours land on whole tens rather than thirds of the domain", () => {
  // 26h 30m, the tallest month in the demo: Recharts drew 6.7h, 13.3h, 20h, 26.7h.
  assert.deepEqual(niceAxisTicks(1_590, 60), [0, 600, 1_200, 1_800]);
});

test("earnings land on whole fifty-dollar steps", () => {
  assert.deepEqual(niceAxisTicks(18_310, 100), [0, 5_000, 10_000, 15_000, 20_000]);
});

test("a small week steps by whole hours, never fractions", () => {
  assert.deepEqual(niceAxisTicks(300, 60), [0, 120, 240, 360]);
  assert.deepEqual(niceAxisTicks(30, 60), [0, 60]);
});

test("an empty chart still has an axis one unit tall", () => {
  assert.deepEqual(niceAxisTicks(0, 60), [0, 60]);
  assert.deepEqual(niceAxisTicks(-5, 100), [0, 100]);
});

test("a maximum exactly on a step ends the axis there", () => {
  assert.deepEqual(niceAxisTicks(1_200, 60), [0, 300, 600, 900, 1_200]);
});
