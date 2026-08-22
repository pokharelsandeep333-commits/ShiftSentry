import assert from "node:assert/strict";
import test from "node:test";
import { greetingForDate } from "./greeting";

test("uses the viewer time zone to choose a morning greeting", () => {
  assert.equal(greetingForDate(new Date("2026-08-21T16:59:00.000Z"), "America/Chicago"), "Good morning");
});

test("switches to afternoon at noon in the viewer time zone", () => {
  assert.equal(greetingForDate(new Date("2026-08-21T17:00:00.000Z"), "America/Chicago"), "Good afternoon");
});

test("switches to evening at 5 PM in the viewer time zone", () => {
  assert.equal(greetingForDate(new Date("2026-08-21T22:00:00.000Z"), "America/Chicago"), "Good evening");
});

test("does not use the server time zone when the viewer is elsewhere", () => {
  assert.equal(greetingForDate(new Date("2026-08-21T16:00:00.000Z"), "America/Los_Angeles"), "Good morning");
});
