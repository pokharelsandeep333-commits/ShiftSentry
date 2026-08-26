import assert from "node:assert/strict";
import test from "node:test";
import { resourceIdSchema, shiftSchema } from "./validation";

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
