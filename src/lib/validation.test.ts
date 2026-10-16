import assert from "node:assert/strict";
import test from "node:test";
import { jobGoogleSettingsSchema, payScheduleFormSchema, resourceIdSchema, shiftSchema } from "./validation";

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
