import assert from "node:assert/strict";
import test from "node:test";
import { buildMonthlyJobAllocation, monthlyAllocationWindow, type MonthlyAllocationShift } from "./job-allocation";

function shift(overrides: Partial<MonthlyAllocationShift>): MonthlyAllocationShift {
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

test("allocates a cross-month shift into the correct monthly job buckets", () => {
  const now = new Date("2026-08-25T12:00:00Z");
  const allocation = buildMonthlyJobAllocation({
    shifts: [shift({ startsAt: new Date("2026-03-31T23:00:00Z"), endsAt: new Date("2026-04-01T01:00:00Z") })],
    now,
    timeZone: "UTC",
    window: monthlyAllocationWindow(now, "UTC"),
  });

  const march = allocation.months.find((month) => month.key === "2026-03");
  const april = allocation.months.find((month) => month.key === "2026-04");
  assert.equal(march?.loggedMinutes["job-job-a"], 60);
  assert.equal(april?.loggedMinutes["job-job-a"], 60);
  assert.equal(march?.netCents["job-job-a"], 6_000);
  assert.equal(april?.netCents["job-job-a"], 6_000);
});

test("counts only worked portions of active shifts and excludes future shifts", () => {
  const now = new Date("2026-08-15T12:00:00Z");
  const allocation = buildMonthlyJobAllocation({
    shifts: [
      shift({ startsAt: new Date("2026-08-15T11:00:00Z"), endsAt: new Date("2026-08-15T14:00:00Z") }),
      shift({ jobId: "job-future", jobName: "Future shift", startsAt: new Date("2026-08-16T09:00:00Z"), endsAt: new Date("2026-08-16T10:00:00Z") }),
    ],
    now,
    timeZone: "UTC",
    window: monthlyAllocationWindow(now, "UTC"),
  });

  const august = allocation.months.find((month) => month.key === "2026-08");
  assert.equal(august?.loggedMinutes["job-job-a"], 60);
  assert.equal(allocation.series.some((series) => series.id === "job-future"), false);
});

test("retains archived job labels and aggregates jobs beyond the first nine", () => {
  const now = new Date("2026-08-25T12:00:00Z");
  const shifts = Array.from({ length: 10 }, (_, index) => shift({
    jobId: `job-${index}`,
    jobName: index === 0 ? "Archived desk" : `Job ${index}`,
    jobColor: `#00000${index}`,
    startsAt: new Date(`2026-08-${String(index + 1).padStart(2, "0")}T09:00:00Z`),
    endsAt: new Date(`2026-08-${String(index + 1).padStart(2, "0")}T10:00:00Z`),
  }));
  const allocation = buildMonthlyJobAllocation({ shifts, now, timeZone: "UTC", window: monthlyAllocationWindow(now, "UTC") });
  const august = allocation.months.find((month) => month.key === "2026-08");

  assert.equal(allocation.series.length, 10);
  assert.equal(allocation.series.some((series) => series.name === "Archived desk"), true);
  assert.equal(allocation.series.at(-1)?.name, "Other");
  assert.equal(august?.loggedMinutes.other, 60);
});
