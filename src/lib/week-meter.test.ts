import assert from "node:assert/strict";
import test from "node:test";
import { allocateWeekMinutes, buildWeekMeter, limitPosition } from "./week-meter";
import { demoDashboard } from "./dashboard-demo";

const CAMPUS = { id: "job-a", name: "Campus desk", color: "#9486ff" };
const CAFE = { id: "job-b", name: "River café", color: "#32d583" };

test("matches the dashboard's planned total and percent for the demo week", () => {
  const meter = buildWeekMeter(demoDashboard.jobs, demoDashboard.globalLimitMinutes);
  assert.equal(meter.plannedMinutes, demoDashboard.loggedMinutes + demoDashboard.scheduledMinutes);
  assert.equal(meter.loggedMinutes, demoDashboard.loggedMinutes);
  assert.equal(meter.percent, 80);
  assert.equal(meter.tone, "warning");
});

test("orders logged segments before scheduled ones and drops empty ones", () => {
  const meter = buildWeekMeter([{ ...CAMPUS, usedMinutes: 120, scheduledMinutes: 60 }, { ...CAFE, usedMinutes: 0, scheduledMinutes: 0 }], 600);
  assert.deepEqual(meter.segments.map((segment) => [segment.jobId, segment.scheduled, segment.widthPercent]), [["job-a", false, 20], ["job-a", true, 10]]);
});

test("an overrun scales the bar to the planned total and moves the limit tick inside it", () => {
  const meter = buildWeekMeter([{ ...CAMPUS, usedMinutes: 600, scheduledMinutes: 200 }], 640);
  assert.equal(meter.tone, "danger");
  assert.equal(meter.segments.reduce((total, segment) => total + segment.widthPercent, 0), 100);
  assert.equal(limitPosition(meter), 80);
});

test("with no limit the bar is calm, has no tick, and is drawn against the total", () => {
  const meter = buildWeekMeter([{ ...CAMPUS, usedMinutes: 90, scheduledMinutes: 30 }], null);
  assert.equal(meter.tone, "calm");
  assert.equal(meter.percent, 0);
  assert.equal(limitPosition(meter), null);
  assert.equal(meter.segments.reduce((total, segment) => total + segment.widthPercent, 0), 100);
});

test("an empty week has no segments and no NaN widths", () => {
  const meter = buildWeekMeter([{ ...CAMPUS, usedMinutes: 0, scheduledMinutes: 0 }], null);
  assert.deepEqual(meter.segments, []);
  assert.equal(meter.plannedMinutes, 0);
});

test("allocateWeekMinutes counts only this week's side of an overnight shift and splits logged from scheduled", () => {
  // Sunday-start week in Chicago (UTC-5 in October). Now is Wed 14 Oct 2026, noon local.
  const now = new Date("2026-10-14T17:00:00Z");
  const jobs = allocateWeekMinutes([CAMPUS, CAFE], [
    // Sat 10 Oct 22:00 -> Sun 11 Oct 02:00 local: only the 2h after midnight are this week.
    { jobId: "job-a", startsAt: new Date("2026-10-11T03:00:00Z"), endsAt: new Date("2026-10-11T07:00:00Z") },
    // Thu 15 Oct 09:00-12:00 local: still to come.
    { jobId: "job-b", startsAt: new Date("2026-10-15T14:00:00Z"), endsAt: new Date("2026-10-15T17:00:00Z") },
    // A job not in the list (archived) is ignored.
    { jobId: "job-archived", startsAt: new Date("2026-10-12T14:00:00Z"), endsAt: new Date("2026-10-12T17:00:00Z") },
  ], now, "America/Chicago", 0);
  assert.deepEqual(jobs.map((job) => [job.id, job.usedMinutes, job.scheduledMinutes]), [["job-a", 120, 0], ["job-b", 0, 180]]);
});
