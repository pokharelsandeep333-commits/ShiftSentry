import assert from "node:assert/strict";
import test from "node:test";
import { checkOccurrences, type ExistingShift } from "./limit-check";

// America/Chicago, weeks starting Sunday. 2026-10-18 is a Sunday (CDT, UTC-5).
const tz = "America/Chicago";
const desk = "job-desk";
const cafe = "job-cafe";
const at = (iso: string) => new Date(iso);
const shift = (id: string, jobId: string, start: string, end: string): ExistingShift => ({ id, jobId, startsAt: at(start), endsAt: at(end) });

// 10h of desk and 6h of café already in the week of Oct 18.
const week = [
  shift("a", desk, "2026-10-19T14:00:00Z", "2026-10-20T00:00:00Z"),
  shift("b", cafe, "2026-10-21T14:00:00Z", "2026-10-21T20:00:00Z"),
];
const base = { jobId: desk, existing: week, timeZone: tz, weekStartsOn: 0 };

test("fits under both limits and reports the totals after it", () => {
  const [result] = checkOccurrences({ ...base, occurrences: [{ startsAt: at("2026-10-22T14:00:00Z"), endsAt: at("2026-10-22T18:00:00Z") }], globalLimit: 1200, jobLimit: 900 });
  assert.equal(result.fits, true);
  assert.deepEqual(result.weeks.map((w) => [w.minutes, w.globalAfter, w.jobAfter]), [[240, 1200, 840]]);
});

test("reaching a limit exactly is allowed; going one minute over is refused (the trigger's >)", () => {
  const exactly = checkOccurrences({ ...base, occurrences: [{ startsAt: at("2026-10-22T14:00:00Z"), endsAt: at("2026-10-22T18:00:00Z") }], globalLimit: 1200, jobLimit: null })[0];
  assert.equal(exactly.fits, true);
  const over = checkOccurrences({ ...base, occurrences: [{ startsAt: at("2026-10-22T14:00:00Z"), endsAt: at("2026-10-22T18:01:00Z") }], globalLimit: 1200, jobLimit: null })[0];
  assert.equal(over.over, "global");
  assert.equal(over.fits, false);
});

test("the job limit counts only that job's shifts, and the overall limit is checked first", () => {
  const job = checkOccurrences({ ...base, occurrences: [{ startsAt: at("2026-10-22T14:00:00Z"), endsAt: at("2026-10-22T16:00:00Z") }], globalLimit: null, jobLimit: 690 })[0];
  assert.equal(job.over, "job");
  const both = checkOccurrences({ ...base, occurrences: [{ startsAt: at("2026-10-22T14:00:00Z"), endsAt: at("2026-10-22T16:00:00Z") }], globalLimit: 1000, jobLimit: 690 })[0];
  assert.equal(both.over, "global");
});

test("an edited shift does not count against itself", () => {
  const [result] = checkOccurrences({ ...base, excludeId: "a", occurrences: [{ startsAt: at("2026-10-19T14:00:00Z"), endsAt: at("2026-10-20T00:00:00Z") }], globalLimit: 960, jobLimit: 600 });
  assert.equal(result.fits, true);
  assert.equal(result.weeks[0].globalAfter, 960);
});

test("an overnight shift across the week boundary counts its minutes in each week", () => {
  // Saturday Oct 24 10 PM to Sunday Oct 25 4 AM local: 2h in one week, 4h in the next.
  const [result] = checkOccurrences({ ...base, occurrences: [{ startsAt: at("2026-10-25T03:00:00Z"), endsAt: at("2026-10-25T09:00:00Z") }], globalLimit: null, jobLimit: null });
  assert.deepEqual(result.weeks.map((w) => w.minutes), [120, 240]);
});

test("overlaps are refused but back-to-back shifts are not", () => {
  const overlap = checkOccurrences({ ...base, occurrences: [{ startsAt: at("2026-10-19T23:00:00Z"), endsAt: at("2026-10-20T02:00:00Z") }], globalLimit: null, jobLimit: null })[0];
  assert.equal(overlap.overlap?.id, "a");
  assert.equal(overlap.fits, false);
  const touching = checkOccurrences({ ...base, occurrences: [{ startsAt: at("2026-10-20T00:00:00Z"), endsAt: at("2026-10-20T03:00:00Z") }], globalLimit: null, jobLimit: null })[0];
  assert.equal(touching.overlap, null);
  assert.equal(touching.fits, true);
});

test("a span that is empty or longer than 24 hours is refused before anything else", () => {
  const [empty, long] = checkOccurrences({ ...base, occurrences: [{ startsAt: at("2026-10-22T14:00:00Z"), endsAt: at("2026-10-22T14:00:00Z") }, { startsAt: at("2026-10-22T14:00:00Z"), endsAt: at("2026-10-23T14:01:00Z") }], globalLimit: null, jobLimit: null });
  assert.equal(empty.badSpan, true);
  assert.equal(long.badSpan, true);
  assert.equal(long.weeks.length, 0);
});

test("weekly repeats count accepted ones toward the next, and skip refused ones", () => {
  // Two 5h shifts in the same week (repeats are a week apart, so use two explicit occurrences in one week).
  const results = checkOccurrences({ ...base, existing: [], occurrences: [
    { startsAt: at("2026-10-19T14:00:00Z"), endsAt: at("2026-10-19T19:00:00Z") },
    { startsAt: at("2026-10-20T14:00:00Z"), endsAt: at("2026-10-20T19:00:00Z") },
    { startsAt: at("2026-10-21T14:00:00Z"), endsAt: at("2026-10-21T15:00:00Z") },
  ], globalLimit: 600, jobLimit: null });
  assert.deepEqual(results.map((r) => r.fits), [true, true, false]);
  assert.equal(results[2].weeks[0].globalAfter, 660);
});
