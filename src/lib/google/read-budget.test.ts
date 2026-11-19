import assert from "node:assert/strict";
import { test } from "node:test";
import { createGoogleReadBudget, readableCalendarIds, settleWithConcurrency } from "./read-budget";

test("duplicate calendar ids count as one read, capped at 25", () => {
  assert.deepEqual(readableCalendarIds(["primary", "primary", "a@group", "", "a@group"]), ["primary", "a@group"]);
  const many = Array.from({ length: 40 }, (_, index) => `cal-${index}`);
  assert.equal(readableCalendarIds(many).length, 25);
});

test("one user is held to their own allowance while others keep capacity", () => {
  const admit = createGoogleReadBudget({ perUser: 3, global: 5, windowMs: 60_000 });
  const at = 1_000;
  assert.equal([admit("a", at), admit("a", at), admit("a", at)].every(Boolean), true);
  assert.equal(admit("a", at), false, "fourth read in the minute is refused");
  assert.equal(admit("b", at), true, "another user still has room");
  assert.equal(admit("a", at + 60_001), true, "the window slides");
});

test("the app-wide budget caps everyone together", () => {
  const admit = createGoogleReadBudget({ perUser: 10, global: 2, windowMs: 60_000 });
  assert.equal(admit("a", 0), true);
  assert.equal(admit("b", 0), true);
  assert.equal(admit("c", 0), false);
});

test("a refused user does not spend a shared slot", () => {
  const admit = createGoogleReadBudget({ perUser: 1, global: 2, windowMs: 60_000 });
  assert.equal(admit("a", 0), true);
  assert.equal(admit("a", 0), false);
  assert.equal(admit("a", 0), false);
  assert.equal(admit("b", 0), true, "the user over their limit left the shared slot free");
});

test("settles every item, in order, with bounded concurrency", async () => {
  let running = 0;
  let peak = 0;
  const results = await settleWithConcurrency([1, 2, 3, 4, 5, 6, 7], 3, async (n) => {
    running += 1;
    peak = Math.max(peak, running);
    await new Promise((resolve) => setTimeout(resolve, 5));
    running -= 1;
    if (n === 4) throw new Error("boom");
    return n * 10;
  });
  assert.equal(peak, 3);
  assert.deepEqual(results.map((result) => (result.status === "fulfilled" ? result.value : "rejected")), [10, 20, 30, "rejected", 50, 60, 70]);
});
