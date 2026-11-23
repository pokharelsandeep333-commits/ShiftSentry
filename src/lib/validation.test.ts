import assert from "node:assert/strict";
import test from "node:test";
import { jobGoogleSettingsSchema, payScheduleFormSchema, resourceIdSchema, shiftSchema, timerStartedAtSchema } from "./validation";
import { fileIssues, readDeductionForm, readJobForm, readSettingsForm } from "./form-input";

test("rejects malformed and injection-shaped resource identifiers", () => {
  assert.equal(resourceIdSchema.safeParse("not-a-uuid").success, false);
  assert.equal(resourceIdSchema.safeParse("' OR 1=1 --").success, false);
  assert.equal(resourceIdSchema.safeParse("00000000-0000-0000-0000-000000000000").success, true);
});

test("rejects shifts whose end is not after the start", () => {
  const result = shiftSchema.safeParse({
    jobId: "00000000-0000-0000-0000-000000000000",
    startsAt: new Date("2026-08-25T15:00:00Z"),
    endsAt: new Date("2026-08-25T14:00:00Z"),
    notes: "",
  });

  assert.equal(result.success, false);
  if (!result.success) assert.equal(result.error.issues[0]?.message, "End time must be after start time.");
});

test("job Google settings: keyword trimmed and optional, calendar optional, sync is a checkbox", () => {
  const parsed = jobGoogleSettingsSchema.parse({ jobId: "5b7e0d52-6a4e-4b8e-9d1a-2f3c4d5e6f70", keyword: "  Campus  ", calendarId: "", sync: "on" });
  assert.deepEqual(parsed, { jobId: "5b7e0d52-6a4e-4b8e-9d1a-2f3c4d5e6f70", keyword: "Campus", calendarId: null, sync: true });
  const blank = jobGoogleSettingsSchema.parse({ jobId: "5b7e0d52-6a4e-4b8e-9d1a-2f3c4d5e6f70", keyword: "   ", calendarId: "work@group.calendar.google.com", sync: null });
  assert.deepEqual([blank.keyword, blank.calendarId, blank.sync], [null, "work@group.calendar.google.com", false]);
  assert.equal(jobGoogleSettingsSchema.safeParse({ jobId: "5b7e0d52-6a4e-4b8e-9d1a-2f3c4d5e6f70", keyword: "k".repeat(81), calendarId: "", sync: null }).success, false);
  assert.equal(jobGoogleSettingsSchema.safeParse({ jobId: "not-a-uuid", keyword: "", calendarId: "", sync: null }).success, false);
});

test("pay schedule form: maps each frequency onto exactly the columns its shape allows", () => {
  assert.deepEqual(payScheduleFormSchema.parse({ frequency: "2w", anchorDate: "2026-10-15", monthDay: "21", paydayOffsetDays: "6" }), {
    pay_schedule: "every_n_weeks", pay_interval_weeks: 2, pay_anchor_date: "2026-10-15", pay_month_day: null, payday_offset_days: 6,
  });
  assert.deepEqual(payScheduleFormSchema.parse({ frequency: "monthly", anchorDate: "2026-10-15", monthDay: "21", paydayOffsetDays: "" }), {
    pay_schedule: "monthly_day", pay_interval_weeks: null, pay_anchor_date: null, pay_month_day: 21, payday_offset_days: null,
  });
  // No schedule clears everything, the payday included.
  assert.deepEqual(payScheduleFormSchema.parse({ frequency: "none", anchorDate: "2026-10-15", monthDay: "21", paydayOffsetDays: "6" }), {
    pay_schedule: "none", pay_interval_weeks: null, pay_anchor_date: null, pay_month_day: null, payday_offset_days: null,
  });
});

test("pay schedule form: refuses what the database would", () => {
  const issue = (input: Record<string, unknown>) => {
    const result = payScheduleFormSchema.safeParse(input);
    return result.success ? null : result.error.issues[0]?.path[0];
  };
  assert.equal(issue({ frequency: "2w", anchorDate: "", monthDay: null, paydayOffsetDays: null }), "anchorDate");
  assert.equal(issue({ frequency: "2w", anchorDate: "2026-02-30", monthDay: null, paydayOffsetDays: null }), "anchorDate");
  assert.equal(issue({ frequency: "1w", anchorDate: "1999-12-31", monthDay: null, paydayOffsetDays: null }), "anchorDate");
  assert.equal(issue({ frequency: "monthly", anchorDate: null, monthDay: "", paydayOffsetDays: null }), "monthDay");
  assert.equal(issue({ frequency: "monthly", anchorDate: null, monthDay: "32", paydayOffsetDays: null }), "monthDay");
  assert.equal(issue({ frequency: "monthly", anchorDate: null, monthDay: "21", paydayOffsetDays: "32" }), "paydayOffsetDays");
  assert.equal(issue({ frequency: "monthly", anchorDate: null, monthDay: "21", paydayOffsetDays: "2.5" }), "paydayOffsetDays");
  assert.equal(issue({ frequency: "5w", anchorDate: "2026-10-15", monthDay: null, paydayOffsetDays: null }), "frequency");
});

test("a running timer's start is accepted only as the timestamp PostgREST returns", () => {
  // Kept verbatim (microseconds and all) so the action can match it back with eq().
  assert.equal(timerStartedAtSchema.safeParse("2026-11-17T22:37:12.123456+00:00").success, true);
  assert.equal(timerStartedAtSchema.safeParse("2026-11-17T22:37:12Z").success, true);
  assert.equal(timerStartedAtSchema.safeParse("2026-11-17").success, false);
  assert.equal(timerStartedAtSchema.safeParse("2026-11-17T22:37:12+00:00,started_at.gt.2000").success, false);
  assert.equal(timerStartedAtSchema.safeParse("2026-13-45T99:99:99Z").success, false);
  assert.equal(timerStartedAtSchema.safeParse(null).success, false);
});

// Form readers (src/lib/form-input.ts): each message lands under the input that caused it.

function form(fields: Record<string, string>) {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

const validJob = { name: "Campus desk", color: "#6d5ce7", hourlyRate: "18.50", taxRate: "7", weeklyLimitHours: "", payFrequency: "none" };

test("job form: a valid form reads into values and pay schedule columns", () => {
  const read = readJobForm(form({ ...validJob, weeklyLimitHours: "20" }));
  assert.equal(read.ok, true);
  if (!read.ok) return;
  assert.deepEqual({ ...read.data, schedule: read.data.schedule.pay_schedule }, { name: "Campus desk", color: "#6d5ce7", weeklyLimitMinutes: 1200, hourlyRateCents: 1850, taxRateBasisPoints: 700, schedule: "none" });
  const blank = readJobForm(form(validJob));
  assert.equal(blank.ok && blank.data.weeklyLimitMinutes, null);
});

test("job form: every bad field gets its own message, keyed by input name, with no top message", () => {
  const read = readJobForm(form({ ...validJob, name: " ", hourlyRate: "abc", taxRate: "150", weeklyLimitHours: "200", payFrequency: "2w", payAnchorDate: "" }));
  assert.equal(read.ok, false);
  if (read.ok) return;
  assert.equal(read.message, "");
  assert.deepEqual(read.fieldErrors, {
    name: "Job name is required.",
    hourlyRate: "Enter a valid hourly rate, such as 18.50.",
    taxRate: "Enter a valid tax rate between 0% and 100%.",
    weeklyLimitHours: "Enter a weekly limit between 1 and 168 hours, or leave it blank for no cap.",
    payAnchorDate: "Enter a date one of this job's pay periods started, such as the first day on your last paystub.",
  });
});

test("job form: a form without the pay schedule fields means no schedule", () => {
  const older = form(validJob);
  older.delete("payFrequency");
  const read = readJobForm(older);
  assert.equal(read.ok && read.data.schedule.pay_schedule, "none");
});

test("deduction form: rate and name messages go under rate and name; a bad job id is a top message", () => {
  const jobId = "5b7e0d52-6a4e-4b8e-9d1a-2f3c4d5e6f70";
  const bad = readDeductionForm(form({ jobId, name: "", rate: "x" }));
  assert.equal(bad.ok, false);
  if (!bad.ok) assert.deepEqual([bad.message, bad.fieldErrors], ["", { rate: "Enter a valid deduction rate between 0% and 100%.", name: "Deduction name is required." }]);
  const lost = readDeductionForm(form({ jobId: "not-a-uuid", name: "Retirement", rate: "3" }));
  assert.equal(!lost.ok && lost.message.length > 0 && Object.keys(lost.fieldErrors).length === 0, true);
  const good = readDeductionForm(form({ jobId, name: " Retirement ", rate: "3" }));
  assert.deepEqual(good.ok && good.data, { jobId, name: "Retirement", rateBasisPoints: 300 });
});

test("settings form: the weekly limit message goes under the hours input", () => {
  const read = readSettingsForm(form({ displayName: "Sam", timeZone: "America/Chicago", weekStartsOn: "1", globalWeeklyLimitHours: "200" }));
  assert.equal(read.ok, false);
  if (!read.ok) assert.deepEqual([read.message, Object.keys(read.fieldErrors)], ["", ["globalWeeklyLimitHours"]]);
  const zone = readSettingsForm(form({ displayName: "", timeZone: "Mars/Olympus", weekStartsOn: "1", globalWeeklyLimitHours: "" }));
  assert.equal(!zone.ok && zone.fieldErrors.timeZone, "Choose a valid IANA time zone.");
  const good = readSettingsForm(form({ displayName: "Sam", timeZone: "America/Chicago", weekStartsOn: "0", globalWeeklyLimitHours: "20" }));
  assert.deepEqual(good.ok && [good.data.timeZone, good.data.weekStartsOn, good.data.globalWeeklyLimitMinutes], ["America/Chicago", 0, 1200]);
});

test("fileIssues: first message per field wins, an earlier message is kept, unmapped issues become the top message", () => {
  const fieldErrors: Record<string, string | undefined> = { hourlyRate: "set first" };
  const message = fileIssues([
    { path: ["hourlyRateCents"], message: "from schema" },
    { path: ["name"], message: "first" },
    { path: ["name"], message: "second" },
    { path: ["jobId"], message: "lost row" },
    { path: [], message: "whole form" },
  ], { hourlyRateCents: "hourlyRate", name: "name" }, fieldErrors);
  assert.equal(message, "lost row");
  assert.deepEqual(fieldErrors, { hourlyRate: "set first", name: "first" });
});
