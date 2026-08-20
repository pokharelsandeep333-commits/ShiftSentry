import assert from "node:assert/strict";
import test from "node:test";
import { calculateEarnings, parseMoneyToCents, parsePercentToBasisPoints } from "./earnings";
import { allocateShiftMinutes } from "./time";

test("calculates gross, tax, named deductions, and net in cents", () => {
  assert.deepEqual(calculateEarnings(480, { hourlyRateCents: 2_500, taxRateBasisPoints: 2_200, deductions: [{ name: "Retirement", rateBasisPoints: 300 }, { name: "Union", rateBasisPoints: 100 }] }), { grossCents: 20_000, taxCents: 4_400, deductionCents: 800, netCents: 14_800 });
});

test("supports partial active-shift minutes and excludes no worked time", () => {
  const snapshot = { hourlyRateCents: 1_800, taxRateBasisPoints: 1_000, deductions: [] };
  assert.equal(calculateEarnings(95, snapshot).grossCents, 2_850);
  assert.deepEqual(calculateEarnings(0, snapshot), { grossCents: 0, taxCents: 0, deductionCents: 0, netCents: 0 });
});

test("parses fixed-point currency and percentages without float drift", () => {
  assert.equal(parseMoneyToCents("21.35"), 2_135);
  assert.equal(parsePercentToBasisPoints("7.25"), 725);
  assert.equal(parsePercentToBasisPoints("100.01"), null);
});

test("keeps a shift snapshot independent when job rates later change", () => {
  const originalSnapshot = { hourlyRateCents: 2_000, taxRateBasisPoints: 1_000, deductions: [] };
  const newJobRate = { hourlyRateCents: 3_000, taxRateBasisPoints: 2_000, deductions: [] };
  assert.equal(calculateEarnings(60, originalSnapshot).netCents, 1_800);
  assert.equal(calculateEarnings(60, newJobRate).netCents, 2_400);
});

test("splits a cross-midnight shift into the correct local days", () => {
  const allocations = allocateShiftMinutes(new Date("2026-08-21T04:00:00Z"), new Date("2026-08-21T07:00:00Z"), "America/Chicago");
  assert.deepEqual(allocations, [{ date: "2026-08-20", minutes: 60 }, { date: "2026-08-21", minutes: 120 }]);
});
