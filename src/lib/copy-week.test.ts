import assert from "node:assert/strict";
import test from "node:test";
import { copySkipFromDatabase, copySkipLabel, copySummary, planWeekCopy, shiftLocalByWeeks, type CopySkipReason, type CopySource } from "./copy-week";
import type { ExistingShift } from "./limit-check";

// America/Chicago, weeks starting Sunday. 2026: CDT (UTC-5) until Sun Nov 1, CST (UTC-6) from then; CDT again from Sun Mar 8.
const tz = "America/Chicago";
const desk = "job-desk";
const cafe = "job-cafe";
const at = (iso: string) => new Date(iso);
const longAgo = at("2026-01-01T00:00:00Z");
const source = (id: string, start: string, end: string, job: Partial<CopySource["job"]> = {}, jobId = desk): CopySource => ({
  id, jobId, startsAt: at(start), endsAt: at(end), notes: null, job: { archived: false, weeklyLimitMinutes: null, ...job },
});
const existing = (id: string, jobId: string, start: string, end: string): ExistingShift => ({ id, jobId, startsAt: at(start), endsAt: at(end) });
const base = { timeZone: tz, weekStartsOn: 0, globalLimit: null, now: longAgo, existing: [] as ExistingShift[] };

test("a copy keeps the local wall-clock time across the autumn clock change", () => {
  // Sat Oct 31, 9:00 CDT -> Sat Nov 7, 9:00 CST: one hour later in UTC.
  assert.equal(shiftLocalByWeeks(at("2026-10-31T14:00:00Z"), tz, 1)?.toISOString(), "2026-11-07T15:00:00.000Z");
});

test("a copy keeps the local wall-clock time across the spring clock change", () => {
  // Sat Mar 7, 9:00 CST -> Sat Mar 14, 9:00 CDT: one hour earlier in UTC.
  assert.equal(shiftLocalByWeeks(at("2026-03-07T15:00:00Z"), tz, 1)?.toISOString(), "2026-03-14T14:00:00.000Z");
});

test("an ordinary week moves by exactly seven days", () => {
  assert.equal(shiftLocalByWeeks(at("2026-11-09T15:00:00Z"), tz, 1)?.toISOString(), "2026-11-16T15:00:00.000Z");
});

test("an overnight shift stays overnight, ending on the next local day, and follows the wall clock", () => {
  // Sat Oct 31 22:00 CDT -> Sun Nov 1 06:00 CST is 9 hours (the clock fell back). The copy, Sat Nov 7 22:00 -> Sun Nov 8 06:00 CST, is 8.
  const [item] = planWeekCopy({ ...base, sources: [source("night", "2026-11-01T03:00:00Z", "2026-11-01T12:00:00Z")] });
  assert.equal(item.skip, null);
  assert.equal(item.startsAt?.toISOString(), "2026-11-08T04:00:00.000Z");
  assert.equal(item.endsAt?.toISOString(), "2026-11-08T12:00:00.000Z");
});

test("a 24-hour shift that a clock change would stretch to 25 hours is skipped, not stored", () => {
  // Sat Oct 24 noon -> Sun Oct 25 noon CDT is 24h; Sat Oct 31 noon CDT -> Sun Nov 1 noon CST would be 25h.
  const [item] = planWeekCopy({ ...base, sources: [source("day", "2026-10-24T17:00:00Z", "2026-10-25T17:00:00Z")] });
  assert.equal(item.skip, "bad-span");
});

// The week of Sun Nov 8 (CST). Mon and Tue, 9:00-17:00 at the desk.
const monday = source("mon", "2026-11-09T15:00:00Z", "2026-11-09T23:00:00Z");
const tuesday = source("tue", "2026-11-10T15:00:00Z", "2026-11-10T23:00:00Z");

test("an overlap skips that shift and the rest are still copied", () => {
  const plan = planWeekCopy({ ...base, sources: [tuesday, monday], existing: [existing("x", cafe, "2026-11-16T14:00:00Z", "2026-11-16T16:00:00Z")] });
  assert.deepEqual(plan.map((item) => [item.source.id, item.skip]), [["mon", "overlap"], ["tue", null]]);
});

test("copying the same week twice skips everything the first copy made", () => {
  const first = planWeekCopy({ ...base, sources: [monday, tuesday] });
  const made = first.map((item, index) => existing(`made-${index}`, desk, item.startsAt!.toISOString(), item.endsAt!.toISOString()));
  const again = planWeekCopy({ ...base, sources: [monday, tuesday], existing: made });
  assert.deepEqual(again.map((item) => item.skip), ["overlap", "overlap"]);
});

test("accepted copies count toward the weekly limit, so the one that would break it is skipped", () => {
  // 8h already next week; a 16h cap leaves room for one of the two 8h copies.
  const plan = planWeekCopy({ ...base, globalLimit: 960, sources: [monday, tuesday], existing: [existing("x", cafe, "2026-11-18T15:00:00Z", "2026-11-18T23:00:00Z")] });
  assert.deepEqual(plan.map((item) => item.skip), [null, "global-limit"]);
});

test("a job's own weekly limit counts only that job", () => {
  const capped = { weeklyLimitMinutes: 600 };
  const plan = planWeekCopy({ ...base, sources: [{ ...monday, job: { ...monday.job, ...capped } }, { ...tuesday, job: { ...tuesday.job, ...capped } }], existing: [existing("x", cafe, "2026-11-18T15:00:00Z", "2026-11-18T23:00:00Z")] });
  assert.deepEqual(plan.map((item) => item.skip), [null, "job-limit"]);
});

test("a break period's lower cap applies to the week the copies land in", () => {
  const breakPeriods = [{ id: "b", start_date: "2026-11-15", end_date: "2026-11-21", weekly_limit_minutes: 600, label: null }];
  const plan = planWeekCopy({ ...base, globalLimit: 2400, breakPeriods, sources: [monday, tuesday] });
  assert.deepEqual(plan.map((item) => item.skip), [null, "global-limit"]);
});

test("archived jobs and times already past are skipped", () => {
  const plan = planWeekCopy({ ...base, now: at("2026-11-16T20:00:00Z"), sources: [monday, tuesday, source("old", "2026-11-11T15:00:00Z", "2026-11-11T23:00:00Z", { archived: true })] });
  assert.deepEqual(plan.map((item) => [item.source.id, item.skip]), [["mon", "past"], ["tue", null], ["old", "archived-job"]]);
});

test("database refusals map to the same reasons the planner gives", () => {
  assert.equal(copySkipFromDatabase("Shift exceeds global weekly limit"), "global-limit");
  assert.equal(copySkipFromDatabase("Shift exceeds job weekly limit"), "job-limit");
  assert.equal(copySkipFromDatabase('conflicting key value violates exclusion constraint "shifts_no_overlap"'), "overlap");
  assert.equal(copySkipFromDatabase('duplicate key value violates unique constraint "shifts_no_duplicate_span"'), "overlap");
  assert.equal(copySkipFromDatabase("Tax and deductions together cannot exceed 100%."), "not-saved");
});

test("every reason has a label, and the summary counts what happened", () => {
  const reasons: CopySkipReason[] = ["archived-job", "past", "bad-span", "overlap", "global-limit", "job-limit", "not-saved"];
  for (const reason of reasons) assert.ok(copySkipLabel(reason).length > 0);
  assert.equal(copySummary(4, 0), "Copied 4 shifts");
  assert.equal(copySummary(1, 2), "Copied 1 shift. 2 skipped.");
  assert.equal(copySummary(0, 3), "Nothing was copied. 3 skipped.");
});
