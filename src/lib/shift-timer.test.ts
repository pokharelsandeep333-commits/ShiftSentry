import assert from "node:assert/strict";
import test from "node:test";
import { checkOccurrences, type ExistingShift } from "./limit-check";
import { LONG_TIMER_MS, adoptableShift, formatElapsed, limitCheckQuery, liveWeekJobs, startedLabel, suggestedClockJob, timerEditorHref, timerOutlook, timerShift, type LimitCheckReply, type LiveTimer } from "./shift-timer";
import { allocateWeekMinutes } from "./week-meter";
import { parseShiftDateTimeInput } from "./shift-date-time";

// America/Chicago, weeks starting Sunday. 2026-10-18 is a Sunday (CDT, UTC-5).
const tz = "America/Chicago";
const desk = "job-desk";
const cafe = "job-cafe";
const at = (iso: string) => new Date(iso);
const shift = (id: string, jobId: string, start: string, end: string): ExistingShift => ({ id, jobId, startsAt: at(start), endsAt: at(end) });

/** What `GET /shifts/limit-check` answers for a timer stopped at `now`, built the way the route builds it. */
function reply(startedAt: string, now: string, existing: ExistingShift[], globalLimit: number | null, jobLimit: number | null, weekStartsOn = 0): LimitCheckReply {
  const span = timerShift(at(startedAt), at(now));
  const [result] = checkOccurrences({ occurrences: [{ startsAt: span.startsAt, endsAt: span.endsAt }], jobId: desk, existing, timeZone: tz, weekStartsOn, globalLimit, jobLimit });
  return {
    status: "ok", jobLimit,
    occurrences: [{
      fits: result.fits, over: result.over, badSpan: result.badSpan,
      overlap: result.overlap ? { jobName: "Café", startsAt: result.overlap.startsAt.toISOString(), endsAt: result.overlap.endsAt.toISOString() } : null,
      weeks: result.weeks.map((week) => ({ weekStart: week.weekStart.toISOString(), globalLimit: week.globalLimit, globalAfter: week.globalAfter, jobAfter: week.jobAfter })),
    }],
  };
}

test("a stopped timer becomes whole minutes at both ends", () => {
  const result = timerShift(at("2026-10-22T14:03:41.512Z"), at("2026-10-22T17:15:59.999Z"));
  assert.equal(result.startsAt.toISOString(), "2026-10-22T14:03:00.000Z");
  assert.equal(result.endsAt.toISOString(), "2026-10-22T17:15:00.000Z");
  assert.equal(result.minutes, 192);
  assert.equal(result.status, "ok");
});

test("under a minute logs nothing; over 24 hours is refused before it reaches the database", () => {
  assert.equal(timerShift(at("2026-10-22T14:03:10Z"), at("2026-10-22T14:03:59Z")).status, "too-short");
  assert.equal(timerShift(at("2026-10-22T14:03:00Z"), at("2026-10-23T14:03:00Z")).status, "ok", "exactly 24 hours is a legal shift");
  assert.equal(timerShift(at("2026-10-22T14:03:00Z"), at("2026-10-23T14:04:00Z")).status, "too-long");
});

test("the start is read from the database's microsecond timestamp", () => {
  assert.equal(timerShift(new Date("2026-10-22T14:03:41.123456+00:00"), at("2026-10-22T15:03:41Z")).minutes, 60);
});

test("the clock does not wrap at a day, so a forgotten timer reads as one", () => {
  assert.equal(formatElapsed(0), "0:00:00");
  assert.equal(formatElapsed(249_900), "0:04:09");
  assert.equal(formatElapsed(26 * 3_600_000 + 61_000), "26:01:01");
  assert.equal(formatElapsed(-5_000), "0:00:00", "a device clock behind the server's never shows a negative time");
  assert.ok(LONG_TIMER_MS < 24 * 3_600_000);
});

test("the start reads as a time today and a weekday otherwise, in the viewer's zone", () => {
  // 03:30Z on the 23rd is 10:30 PM on the 22nd in Chicago.
  assert.equal(startedLabel(at("2026-10-23T03:30:00Z"), at("2026-10-23T04:30:00Z"), tz), "10:30 PM");
  assert.equal(startedLabel(at("2026-10-23T03:30:00Z"), at("2026-10-23T06:30:00Z"), tz), "Thu 10:30 PM", "stopped after local midnight");
});

test("the editor link carries the job, the local times and the timer it replaces", () => {
  const href = new URL(timerEditorHref({ jobId: desk, startedAt: "2026-10-22T14:03:41.123456+00:00" }, at("2026-10-22T17:15:30Z"), tz), "https://example.test");
  assert.equal(href.pathname, "/shifts/new");
  assert.equal(href.searchParams.get("jobId"), desk);
  assert.equal(href.searchParams.get("startsAt"), "2026-10-22T09:03");
  assert.equal(href.searchParams.get("endsAt"), "2026-10-22T12:15");
  assert.equal(href.searchParams.get("timer"), "2026-10-22T14:03:41.123456+00:00");
  // The editor parses these with the shared parser, not its own.
  assert.ok(parseShiftDateTimeInput(href.searchParams.get("startsAt") ?? ""));
});

test("a forgotten timer's editor link stops at the 24 hours a shift may last", () => {
  const href = new URL(timerEditorHref({ jobId: desk, startedAt: "2026-10-22T14:00:00Z" }, at("2026-10-24T09:00:00Z"), tz), "https://example.test");
  assert.equal(href.searchParams.get("endsAt"), "2026-10-23T09:00");
});

test("the limit check is not asked about a timer under a minute old", () => {
  assert.equal(limitCheckQuery({ jobId: desk, startedAt: "2026-10-22T14:00:10Z" }, at("2026-10-22T14:00:50Z"), tz), null);
  const query = new URLSearchParams(limitCheckQuery({ jobId: desk, startedAt: "2026-10-22T14:00:10Z" }, at("2026-10-22T16:30:50Z"), tz) ?? "");
  assert.deepEqual(Object.fromEntries(query), { job: desk, start: "2026-10-22T09:00", end: "2026-10-22T11:30", repeat: "1" });
});

test("fits: the room under the tighter limit, and when it runs out", () => {
  // 10h already worked this week; a 12h overall cap leaves 2h, less the 1h on the clock.
  const existing = [shift("a", cafe, "2026-10-19T14:00:00Z", "2026-10-20T00:00:00Z")];
  const outlook = timerOutlook(reply("2026-10-22T14:00:00Z", "2026-10-22T15:00:00Z", existing, 720, null), at("2026-10-22T15:00:00Z"), tz, 0);
  assert.deepEqual(outlook && outlook.kind === "fits" && { limit: outlook.limit, remaining: outlook.remainingMinutes, capAt: outlook.capAt?.toISOString() }, { limit: "global", remaining: 60, capAt: "2026-10-22T16:01:00.000Z" });
  // A job limit tighter than the overall one wins.
  const job = timerOutlook(reply("2026-10-22T14:00:00Z", "2026-10-22T15:00:00Z", existing, 720, 90), at("2026-10-22T15:00:00Z"), tz, 0);
  assert.equal(job?.kind === "fits" && job.limit, "job");
  assert.equal(job?.kind === "fits" && job.remainingMinutes, 30);
});

test("reaching a limit exactly still fits; one minute past is refused, as in the trigger", () => {
  const existing = [shift("a", cafe, "2026-10-19T14:00:00Z", "2026-10-20T00:00:00Z")];
  const exactly = timerOutlook(reply("2026-10-22T14:00:00Z", "2026-10-22T16:00:00Z", existing, 720, null), at("2026-10-22T16:00:00Z"), tz, 0);
  assert.deepEqual(exactly && exactly.kind === "fits" && exactly.remainingMinutes, 0);
  const over = timerOutlook(reply("2026-10-22T14:00:00Z", "2026-10-22T16:01:00Z", existing, 720, null), at("2026-10-22T16:01:00Z"), tz, 0);
  assert.deepEqual(over, { kind: "refused", reason: "global", overlap: null });
});

test("a timer running into a logged shift says it overlaps", () => {
  const existing = [shift("later", cafe, "2026-10-22T18:00:00Z", "2026-10-22T22:00:00Z")];
  const outlook = timerOutlook(reply("2026-10-22T14:00:00Z", "2026-10-22T18:30:00Z", existing, null, null), at("2026-10-22T18:30:00Z"), tz, 0);
  assert.equal(outlook?.kind, "refused");
  assert.equal(outlook?.kind === "refused" && outlook.reason, "overlap");
  assert.equal(outlook?.kind === "refused" && outlook.overlap?.startsAt, "2026-10-22T18:00:00.000Z");
});

test("a timer past the week start counts its new minutes toward the new week", () => {
  // Started Saturday 10 PM in a week already at its 20h cap; it is now Sunday
  // 2 AM. Saturday's two hours land on a full week and are refused...
  const fullWeek = [shift("a", cafe, "2026-10-19T14:00:00Z", "2026-10-20T10:00:00Z")];
  const refused = timerOutlook(reply("2026-10-25T03:00:00Z", "2026-10-25T07:00:00Z", fullWeek, 1200, null), at("2026-10-25T07:00:00Z"), tz, 0);
  assert.deepEqual(refused, { kind: "refused", reason: "global", overlap: null });
  // ...while with room left last week, the outlook reads the week holding now:
  // two hours into the new one, 18 left.
  const roomy = [shift("a", cafe, "2026-10-19T14:00:00Z", "2026-10-20T00:00:00Z")];
  const outlook = timerOutlook(reply("2026-10-25T03:00:00Z", "2026-10-25T07:00:00Z", roomy, 1200, null), at("2026-10-25T07:00:00Z"), tz, 0);
  assert.equal(outlook?.kind === "fits" && outlook.remainingMinutes, 1080);
});

test("a cap that the week's end beats is no cap at all", () => {
  // Saturday 9 PM, an hour on the clock, 5h of room: the week ends at midnight first.
  const outlook = timerOutlook(reply("2026-10-25T01:00:00Z", "2026-10-25T02:00:00Z", [], 360, null), at("2026-10-25T02:00:00Z"), tz, 0);
  assert.deepEqual(outlook && outlook.kind === "fits" && { remaining: outlook.remainingMinutes, capAt: outlook.capAt }, { remaining: 300, capAt: null });
});

test("no limits means nothing to warn about", () => {
  assert.deepEqual(timerOutlook(reply("2026-10-22T14:00:00Z", "2026-10-22T15:00:00Z", [], null, null), at("2026-10-22T15:00:00Z"), tz, 0), { kind: "fits", limit: null, remainingMinutes: null, capAt: null });
});

// ---- adopting a logged shift ----------------------------------------------------

const planned = (id: string, jobId: string, start: string, end: string) => ({ id, jobId, startsAt: at(start), endsAt: at(end) });

test("clocking in during a logged shift of the chosen job adopts it", () => {
  const nineToFive = planned("s1", desk, "2026-10-22T14:00:00Z", "2026-10-22T22:00:00Z");
  assert.deepEqual(adoptableShift([nineToFive], desk, at("2026-10-22T15:10:00Z")), { shift: nineToFive, sameJob: true });
});

test("a shift under way on another job is found but flagged, so the action can refuse it", () => {
  const cafeShift = planned("s1", cafe, "2026-10-22T14:00:00Z", "2026-10-22T22:00:00Z");
  assert.deepEqual(adoptableShift([cafeShift], desk, at("2026-10-22T15:10:00Z")), { shift: cafeShift, sameJob: false });
});

test("clocking in up to 30 minutes early adopts the chosen job's next shift, the earliest first", () => {
  const nine = planned("s1", desk, "2026-10-22T14:00:00Z", "2026-10-22T18:00:00Z");
  const later = planned("s2", desk, "2026-10-22T14:20:00Z", "2026-10-22T15:00:00Z");
  assert.equal(adoptableShift([later, nine], desk, at("2026-10-22T13:30:00Z"))?.shift.id, "s1", "exactly 30 minutes early");
  assert.equal(adoptableShift([nine], desk, at("2026-10-22T13:29:00Z")), null, "31 minutes early is a separate shift");
});

test("another job starting soon does not get in the way of clocking in", () => {
  const cafeSoon = planned("s1", cafe, "2026-10-22T14:00:00Z", "2026-10-22T18:00:00Z");
  assert.equal(adoptableShift([cafeSoon], desk, at("2026-10-22T13:45:00Z")), null);
});

test("the card starts on the job of the shift under way, else the one about to start", () => {
  const now = at("2026-10-22T13:45:00Z");
  assert.equal(suggestedClockJob([planned("s1", cafe, "2026-10-22T14:00:00Z", "2026-10-22T18:00:00Z")], now), cafe);
  assert.equal(suggestedClockJob([planned("s1", cafe, "2026-10-22T15:00:00Z", "2026-10-22T18:00:00Z")], now), null);
  assert.equal(suggestedClockJob([planned("s1", cafe, "2026-10-22T14:00:00Z", "2026-10-22T18:00:00Z"), planned("s2", desk, "2026-10-22T13:00:00Z", "2026-10-22T13:50:00Z")], now), desk);
});

test("an adopted shift is corrected on its own edit page, and left out of its own limit check", () => {
  const adopted = { shiftId: "shift-1", startsAt: "2026-10-22T14:00:00Z", endsAt: "2026-10-22T22:00:00Z" };
  const href = new URL(timerEditorHref({ jobId: desk, startedAt: "2026-10-22T13:55:00Z", adopted }, at("2026-10-22T21:40:00Z"), tz), "https://example.test");
  assert.equal(href.pathname, "/shifts/shift-1/edit");
  assert.equal(href.searchParams.get("jobId"), null);
  assert.equal(href.searchParams.get("startsAt"), "2026-10-22T08:55");
  assert.equal(href.searchParams.get("endsAt"), "2026-10-22T16:40");
  assert.equal(href.searchParams.get("timer"), "2026-10-22T13:55:00Z");
  const query = new URLSearchParams(limitCheckQuery({ jobId: desk, startedAt: "2026-10-22T13:55:00Z", adopted }, at("2026-10-22T21:40:00Z"), tz) ?? "");
  assert.equal(query.get("exclude"), "shift-1");
});

// ---- live week minutes -----------------------------------------------------------

const jobsAt = (shifts: { jobId: string; startsAt: Date; endsAt: Date }[], countedAt: Date) =>
  allocateWeekMinutes([{ id: desk }, { id: cafe }], shifts, countedAt, tz, 0);
const planOf = (jobs: { usedMinutes: number; scheduledMinutes: number }[]) => jobs.reduce((total, job) => total + job.usedMinutes + job.scheduledMinutes, 0);

test("with no timer the server's minutes pass straight through", () => {
  const jobs = jobsAt([], at("2026-10-22T15:00:00Z"));
  assert.deepEqual(liveWeekJobs(jobs, null, at("2026-10-22T15:00:00Z"), at("2026-10-22T16:00:00Z"), tz, 0), { jobs, workedDelta: 0 });
});

test("a running timer counts its whole minutes as logged as it ticks", () => {
  const countedAt = at("2026-10-22T15:00:00Z");
  const timer: LiveTimer = { jobId: desk, startedAt: "2026-10-22T14:00:30Z", adopted: null };
  const live = liveWeekJobs(jobsAt([], countedAt), timer, countedAt, at("2026-10-22T16:15:59Z"), tz, 0);
  assert.equal(live.jobs.find((job) => job.id === desk)?.usedMinutes, 135);
  assert.equal(live.workedDelta, 135);
});

test("nothing is counted twice: the live meter equals the server's total once Stop has saved the shift", () => {
  const countedAt = at("2026-10-22T15:00:00Z");
  const now = at("2026-10-22T18:20:00Z");
  const existing = [{ jobId: cafe, startsAt: at("2026-10-20T14:00:00Z"), endsAt: at("2026-10-20T20:00:00Z") }];
  const timer: LiveTimer = { jobId: desk, startedAt: "2026-10-22T14:05:00Z", adopted: null };
  const live = liveWeekJobs(jobsAt(existing, countedAt), timer, countedAt, now, tz, 0);
  const afterStop = jobsAt([...existing, { jobId: desk, startsAt: at("2026-10-22T14:05:00Z"), endsAt: now }], now);
  assert.deepEqual(live.jobs, afterStop);
});

test("an adopted shift is swapped for the timer so far plus what is left of the plan", () => {
  // Desk 9-5 (CDT) logged; clocked in 8:55, the page counted at 10:00, now 10:30.
  const shift = { jobId: desk, startsAt: at("2026-10-22T14:00:00Z"), endsAt: at("2026-10-22T22:00:00Z") };
  const countedAt = at("2026-10-22T15:00:00Z");
  const timer: LiveTimer = { jobId: desk, startedAt: "2026-10-22T13:55:00Z", adopted: { shiftId: "s1", startsAt: shift.startsAt.toISOString(), endsAt: shift.endsAt.toISOString() } };
  const base = jobsAt([shift], countedAt);
  assert.equal(base.find((job) => job.id === desk)?.usedMinutes, 480, "a started shift counts whole, as on the server");
  const live = liveWeekJobs(base, timer, countedAt, at("2026-10-22T15:30:00Z"), tz, 0);
  const deskLive = live.jobs.find((job) => job.id === desk);
  assert.deepEqual([deskLive?.usedMinutes, deskLive?.scheduledMinutes], [95, 390]);
  assert.equal(planOf(live.jobs), 485, "8:55 to 5:00 if the shift runs to its planned end");
  // The logged figure was 60 (9:00 to the 10:00 count); it is now the 95 clocked.
  assert.equal(live.workedDelta, 35);
});

test("clocked in early: the adopted shift's plan stays scheduled, the early minutes are logged", () => {
  const shift = { jobId: desk, startsAt: at("2026-10-22T14:00:00Z"), endsAt: at("2026-10-22T22:00:00Z") };
  const countedAt = at("2026-10-22T13:56:00Z");
  const timer: LiveTimer = { jobId: desk, startedAt: "2026-10-22T13:55:00Z", adopted: { shiftId: "s1", startsAt: shift.startsAt.toISOString(), endsAt: shift.endsAt.toISOString() } };
  const live = liveWeekJobs(jobsAt([shift], countedAt), timer, countedAt, at("2026-10-22T13:58:00Z"), tz, 0);
  const deskLive = live.jobs.find((job) => job.id === desk);
  assert.deepEqual([deskLive?.usedMinutes, deskLive?.scheduledMinutes, live.workedDelta], [3, 480, 3]);
});

test("a timer begun last week counts only its minutes in this one", () => {
  // Saturday 11 PM CDT to Sunday 1:30 AM; the week starts Sunday.
  const countedAt = at("2026-10-25T06:00:00Z");
  const timer: LiveTimer = { jobId: desk, startedAt: "2026-10-25T04:00:00Z", adopted: null };
  const live = liveWeekJobs(jobsAt([], countedAt), timer, countedAt, at("2026-10-25T06:30:00Z"), tz, 0);
  assert.equal(live.jobs.find((job) => job.id === desk)?.usedMinutes, 90);
  assert.equal(live.workedDelta, 90);
});

test("a timer on a job the meter leaves out (archived) adds nothing", () => {
  const countedAt = at("2026-10-22T15:00:00Z");
  const jobs = jobsAt([], countedAt);
  assert.deepEqual(liveWeekJobs(jobs, { jobId: "job-archived", startedAt: "2026-10-22T14:00:00Z", adopted: null }, countedAt, at("2026-10-22T16:00:00Z"), tz, 0), { jobs, workedDelta: 0 });
});

test("an adopted shift's planned total holds steady as the timer ticks, mid-minute included", () => {
  const shift = { jobId: desk, startsAt: at("2026-10-22T14:00:00Z"), endsAt: at("2026-10-22T22:00:00Z") };
  const countedAt = at("2026-10-22T15:00:00Z");
  const timer: LiveTimer = { jobId: desk, startedAt: "2026-10-22T13:22:14Z", adopted: { shiftId: "s1", startsAt: shift.startsAt.toISOString(), endsAt: shift.endsAt.toISOString() } };
  const base = jobsAt([shift], countedAt);
  const totals = ["2026-10-22T15:30:00Z", "2026-10-22T15:30:42Z", "2026-10-22T15:31:59Z", "2026-10-22T16:02:30Z"].map((now) => planOf(liveWeekJobs(base, timer, countedAt, at(now), tz, 0).jobs));
  // 8:22 to 5:00 PM CDT, every time.
  assert.deepEqual(totals, [518, 518, 518, 518]);
});
