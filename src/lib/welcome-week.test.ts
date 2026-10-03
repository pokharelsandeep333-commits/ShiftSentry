import assert from "node:assert/strict";
import test from "node:test";
import { EXAMPLE_DAY, EXAMPLE_OVERNIGHT, EXAMPLE_RECEIPT, EXAMPLE_WEEK, earnedSoFar, roomLeft, spansOverlap, tryShift, weekTotals } from "./welcome-week";

test("the example week opens at 16 of 20 hours, which is the 80% alert line", () => {
  const totals = weekTotals(EXAMPLE_WEEK);
  assert.equal(totals.loggedMinutes, 780);
  assert.equal(totals.plannedMinutes, 180);
  assert.equal(totals.totalMinutes, 960);
  assert.equal(totals.percent, 80);
  assert.equal(totals.alert, true);
});

test("a shift that would pass the global limit is refused, and says by how much", () => {
  const result = tryShift(EXAMPLE_WEEK, { jobId: "cafe", minutes: 300 });
  assert.equal(result.status, "refused");
  assert.equal(result.reason, "global");
  assert.equal(result.totalMinutes, 1_260);
  assert.equal(result.overByMinutes, 60);
});

test("a shift that lands exactly on the limit is saved, as the trigger allows", () => {
  const result = tryShift(EXAMPLE_WEEK, { jobId: "cafe", minutes: 240 });
  assert.equal(result.status, "saved");
  assert.equal(result.reason, null);
  assert.equal(result.totalMinutes, 1_200);
  assert.equal(result.overByMinutes, 0);
});

test("a per-job cap refuses a shift even when the global limit has room", () => {
  const result = tryShift(EXAMPLE_WEEK, { jobId: "campus", minutes: 120 });
  assert.equal(result.status, "refused");
  assert.equal(result.reason, "job");
  assert.equal(result.overByMinutes, 60);
});

test("the room left is the global limit's for a job without a cap, and the job's own when it is tighter", () => {
  assert.equal(roomLeft(EXAMPLE_WEEK, "cafe"), 240);
  assert.equal(roomLeft(EXAMPLE_WEEK, "campus"), 60);
});

test("earnings count only worked shifts, rounded per job like the real calculation", () => {
  assert.deepEqual(earnedSoFar(EXAMPLE_WEEK), { grossCents: 15_500, taxCents: 1_860, deductionCents: 0, netCents: 13_640 });
});

test("back-to-back shifts touch without overlapping; a shift inside another's span clashes", () => {
  assert.equal(spansOverlap(EXAMPLE_DAY.desk, EXAMPLE_DAY.cafe), false);
  assert.equal(spansOverlap(EXAMPLE_DAY.clash, EXAMPLE_DAY.desk), true);
});

test("the overnight example splits at midnight into Friday 2h and Saturday 4h", () => {
  assert.deepEqual(EXAMPLE_OVERNIGHT.map(({ day, minutes }) => ({ day, minutes })), [{ day: "Fri", minutes: 120 }, { day: "Sat", minutes: 240 }]);
});

test("the receipt prices 4h at the desk rate through calculateEarnings", () => {
  assert.equal(EXAMPLE_RECEIPT.grossCents, 5_000);
  assert.equal(EXAMPLE_RECEIPT.taxCents, 600);
  assert.equal(EXAMPLE_RECEIPT.netCents, 4_400);
});
