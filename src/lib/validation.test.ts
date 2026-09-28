import assert from "node:assert/strict";
import test from "node:test";
import { jobGoogleSettingsSchema, resourceIdSchema, shiftSchema } from "./validation";

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
