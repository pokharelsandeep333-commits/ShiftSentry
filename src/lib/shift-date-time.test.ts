import assert from "node:assert/strict";
import test from "node:test";
import { combineShiftDateAndTime, formatShiftDateAndTime, formatShiftDateOnly, parseShiftDateTimeInput, synchronizedEndDate } from "./shift-date-time";

test("parses compact shift date and time input", () => {
  assert.deepEqual(parseShiftDateTimeInput("8252026300pm"), {
    date: "2026-08-25",
    time: "15:00",
    value: "2026-08-25T15:00",
    formatted: "08/25/2026 03:00 PM",
  });
  assert.equal(parseShiftDateTimeInput("112026300pm")?.formatted, "01/01/2026 03:00 PM");
});

test("normalizes formatted and native shift date-time values", () => {
  assert.equal(parseShiftDateTimeInput("8/25/2026 3:00 pm")?.formatted, "08/25/2026 03:00 PM");
  assert.equal(parseShiftDateTimeInput("2026-08-25T00:05")?.formatted, "08/25/2026 12:05 AM");
  assert.equal(parseShiftDateTimeInput("123120261200pm")?.value, "2026-12-31T12:00");
});

test("rejects impossible or incomplete quick entry values", () => {
  assert.equal(parseShiftDateTimeInput("22920261200pm"), null);
  assert.equal(parseShiftDateTimeInput("82520261300pm"), null);
  assert.equal(parseShiftDateTimeInput("8252026300"), null);
  assert.equal(parseShiftDateTimeInput("8/25/2026 3:00"), null);
});

test("formats picker selections and only synchronizes an end date while linked", () => {
  assert.equal(combineShiftDateAndTime("2026-08-25", "15:00"), "2026-08-25T15:00");
  assert.equal(formatShiftDateAndTime("2026-08-25", "15:00"), "08/25/2026 03:00 PM");
  assert.equal(formatShiftDateAndTime("2026-08-25", ""), "08/25/2026");
  assert.equal(formatShiftDateOnly("2026-08-25"), "08/25/2026");
  assert.equal(synchronizedEndDate("2026-08-25", true), "2026-08-25");
  assert.equal(synchronizedEndDate("2026-08-25", false), null);
});
