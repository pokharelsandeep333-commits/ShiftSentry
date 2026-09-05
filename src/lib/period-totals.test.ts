import assert from "node:assert/strict";
import test from "node:test";
import { bucketWorkedShiftsByMonth, combineMonthTotals, type WorkedShift } from "./period-totals";

const NOW = new Date("2026-08-15T12:00:00Z");

function shift(overrides: Partial<WorkedShift>): WorkedShift {
  return {
    jobId: "job-a",
    jobName: "Campus desk",
    jobColor: "#9486ff",
    startsAt: new Date("2026-08-01T09:00:00Z"),
    endsAt: new Date("2026-08-01T10:00:00Z"),
    hourlyRateCents: 6_000,
    taxRateBasisPoints: 0,
    deductions: [],
    ...overrides,
  };
}

function bucket(shifts: WorkedShift[], now = NOW) {
  return bucketWorkedShiftsByMonth(shifts, now, "UTC");
}

test("counts an in-progress shift only up to now and skips future ones entirely", () => {
  const months = bucket([
    shift({ startsAt: new Date("2026-08-15T11:00:00Z"), endsAt: new Date("2026-08-15T14:00:00Z") }),
    shift({ jobId: "job-future", jobName: "Future shift", startsAt: new Date("2026-08-16T09:00:00Z"), endsAt: new Date("2026-08-16T10:00:00Z") }),
  ]);

  assert.deepEqual(months.map((month) => month.key), ["2026-08"]);
  assert.equal(months[0].minutes, 60);
  assert.equal(months[0].earnings.grossCents, 6_000);
  assert.deepEqual(months[0].jobs.map((job) => job.id), ["job-a"]);
});

test("rounds per local-day slice, matching how the weekly total is built", () => {
  // 22:30 to 01:30 splits at local midnight into two 90-minute slices. Rounding
  // each slice gives 1502 + 1502; rounding the 180-minute span in one go gives
  // 3003. The dashboard totals this week per slice, so every month bucket must
  // too -- otherwise the same shift is worth a cent more under one range.
  const months = bucket([shift({ startsAt: new Date("2026-08-01T22:30:00Z"), endsAt: new Date("2026-08-02T01:30:00Z"), hourlyRateCents: 1_001 })]);

  assert.equal(months[0].minutes, 180);
  assert.equal(months[0].earnings.grossCents, 3_004);
  assert.equal(months[0].earnings.netCents, 3_004);
});

test("applies tax and deductions to every slice and nets them out", () => {
  const months = bucket([shift({ hourlyRateCents: 2_000, taxRateBasisPoints: 1_500, deductions: [{ name: "Retirement", rateBasisPoints: 500 }] })]);

  assert.equal(months[0].earnings.grossCents, 2_000);
  assert.equal(months[0].earnings.taxCents, 300);
  assert.equal(months[0].earnings.deductionCents, 100);
  assert.equal(months[0].earnings.netCents, 1_600);
});

test("splits a shift that crosses a month boundary into both months", () => {
  const months = bucket([shift({ startsAt: new Date("2026-07-31T23:00:00Z"), endsAt: new Date("2026-08-01T01:00:00Z") })]);

  assert.deepEqual(months.map((month) => [month.key, month.minutes]), [["2026-07", 60], ["2026-08", 60]]);
});

test("returns a contiguous run so a month with no work still has a bucket", () => {
  const months = bucket([
    shift({ startsAt: new Date("2026-03-02T09:00:00Z"), endsAt: new Date("2026-03-02T10:00:00Z") }),
    shift({ startsAt: new Date("2026-08-02T09:00:00Z"), endsAt: new Date("2026-08-02T10:00:00Z") }),
  ]);

  assert.deepEqual(months.map((month) => month.key), ["2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"]);
  assert.deepEqual(months.map((month) => month.label), ["Mar 2026", "Apr 2026", "May 2026", "Jun 2026", "Jul 2026", "Aug 2026"]);
  const april = months[1];
  assert.equal(april.minutes, 0);
  assert.equal(april.earnings.netCents, 0);
  assert.deepEqual(april.jobs, []);
});

test("reports no months at all when nothing has been worked", () => {
  assert.deepEqual(bucket([shift({ startsAt: new Date("2026-09-01T09:00:00Z"), endsAt: new Date("2026-09-01T10:00:00Z") })]), []);
});

test("combines a span of months and ranks the breakdown by net earnings", () => {
  const months = bucket([
    shift({ startsAt: new Date("2026-06-02T09:00:00Z"), endsAt: new Date("2026-06-02T12:00:00Z") }),
    shift({ jobId: "job-quiet", jobName: "Library", jobColor: "#98a2b3", hourlyRateCents: 1_500, startsAt: new Date("2026-07-02T09:00:00Z"), endsAt: new Date("2026-07-02T10:00:00Z") }),
    shift({ startsAt: new Date("2026-08-02T09:00:00Z"), endsAt: new Date("2026-08-02T10:00:00Z") }),
  ]);
  const combined = combineMonthTotals(months);

  assert.equal(combined.minutes, 300);
  assert.equal(combined.earnings.netCents, 25_500);
  assert.deepEqual(combined.jobs.map((job) => [job.id, job.netCents, job.minutes]), [
    ["job-a", 24_000, 240],
    ["job-quiet", 1_500, 60],
  ]);
});

test("combining no months totals to zero rather than throwing", () => {
  const combined = combineMonthTotals([]);

  assert.equal(combined.minutes, 0);
  assert.equal(combined.earnings.grossCents, 0);
  assert.deepEqual(combined.jobs, []);
});
