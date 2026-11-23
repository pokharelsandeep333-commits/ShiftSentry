import assert from "node:assert/strict";
import test from "node:test";
import { moveInGrid, nearestFreeSlot, QUICK_ADD_MINUTES, quickAddDayHref, quickAddHref, slotForMinute, slotIsFree, slotLabel, slotTime, SLOTS_PER_DAY, type GridCell } from "./calendar-quick-add";
import { parseShiftDateTimeInput } from "./shift-date-time";

test("a minute of the day rounds down to its half-hour slot", () => {
  assert.equal(SLOTS_PER_DAY, 48);
  assert.equal(slotForMinute(0), 0);
  assert.equal(slotForMinute(29), 0);
  assert.equal(slotForMinute(30), 1);
  assert.equal(slotForMinute(9 * 60 + 47), 19);
  assert.equal(slotForMinute(24 * 60 - 1), 47);
  assert.equal(slotForMinute(24 * 60), null);
  assert.equal(slotForMinute(-1), null);
  assert.equal(slotForMinute(Number.NaN), null);
});

test("slot times and labels are local wall-clock readings", () => {
  assert.equal(slotTime(0), "00:00");
  assert.equal(slotTime(19), "09:30");
  assert.equal(slotTime(47), "23:30");
  assert.equal(slotLabel(0), "12:00 AM");
  assert.equal(slotLabel(19), "9:30 AM");
  assert.equal(slotLabel(24), "12:00 PM");
  assert.equal(slotLabel(47), "11:30 PM");
});

test("a slot's link opens Add shift at that time for the default length", () => {
  assert.equal(QUICK_ADD_MINUTES, 120);
  assert.equal(quickAddHref("2026-11-23", 18), "/shifts/new?startsAt=2026-11-23T09:00&endsAt=2026-11-23T11:00");
  assert.equal(quickAddHref("2026-11-23", 19), "/shifts/new?startsAt=2026-11-23T09:30&endsAt=2026-11-23T11:30");
});

test("a late slot's shift ends after midnight, across month and year ends", () => {
  assert.equal(quickAddHref("2026-11-23", 46), "/shifts/new?startsAt=2026-11-23T23:00&endsAt=2026-11-24T01:00");
  assert.equal(quickAddHref("2026-11-30", 47), "/shifts/new?startsAt=2026-11-30T23:30&endsAt=2026-12-01T01:30");
  assert.equal(quickAddHref("2026-12-31", 45), "/shifts/new?startsAt=2026-12-31T22:30&endsAt=2027-01-01T00:30");
});

test("the link's values parse back the way /shifts/new reads them", () => {
  const href = quickAddHref("2026-03-08", 4)!;
  const params = new URL(href, "https://example.test").searchParams;
  assert.equal(parseShiftDateTimeInput(params.get("startsAt")!)?.value, "2026-03-08T02:00");
  // Wall clock, not elapsed time: a DST day still reads two hours on the clock.
  assert.equal(parseShiftDateTimeInput(params.get("endsAt")!)?.value, "2026-03-08T04:00");
});

test("no link for an unreal day or slot", () => {
  assert.equal(quickAddHref("2026-02-30", 18), null);
  assert.equal(quickAddHref("not-a-day", 18), null);
  assert.equal(quickAddHref("2026-11-23", 48), null);
  assert.equal(quickAddHref("2026-11-23", -1), null);
  assert.equal(quickAddHref("2026-11-23", 1.5), null);
});

test("a day's link carries the date only", () => {
  assert.equal(quickAddDayHref("2026-11-23"), "/shifts/new?date=2026-11-23");
  assert.equal(quickAddDayHref("2026-02-29"), null);
  assert.equal(quickAddDayHref("2026-11-23&x=1"), null);
});

test("a slot any item touches is not free", () => {
  // A shift from 9:00 to 10:15.
  const placed = [{ top: 540, height: 75 }];
  assert.equal(slotIsFree(17, placed), true); // 8:30-9:00 ends where the shift starts
  assert.equal(slotIsFree(18, placed), false);
  assert.equal(slotIsFree(20, placed), false); // 10:00-10:30 holds the last 15 minutes
  assert.equal(slotIsFree(21, placed), true);
  assert.equal(slotIsFree(18, []), true);
});

test("the first tab stop is the free slot nearest the preferred one", () => {
  assert.equal(nearestFreeSlot(18, []), 18);
  // 8:00 to 11:00 busy: 7:30 is nearer 9:00 than 11:00 is.
  assert.equal(nearestFreeSlot(18, [{ top: 480, height: 180 }]), 15);
  // 8:30 to 10:00 busy: 8:00 and 10:00 are equally near; the later one wins.
  assert.equal(nearestFreeSlot(18, [{ top: 510, height: 90 }]), 20);
  assert.equal(nearestFreeSlot(18, [{ top: 0, height: 24 * 60 }]), null);
});

test("arrows move over the grid, skipping busy slots", () => {
  // Two days; day 0 has 9:00 busy.
  const cells: GridCell[] = [{ col: 0, row: 17 }, { col: 0, row: 19 }, { col: 1, row: 17 }, { col: 1, row: 18 }, { col: 1, row: 19 }];
  assert.deepEqual(moveInGrid(cells, { col: 0, row: 17 }, "ArrowDown"), { col: 0, row: 19 });
  assert.deepEqual(moveInGrid(cells, { col: 0, row: 19 }, "ArrowUp"), { col: 0, row: 17 });
  assert.equal(moveInGrid(cells, { col: 0, row: 17 }, "ArrowUp"), null);
  assert.deepEqual(moveInGrid(cells, { col: 0, row: 17 }, "ArrowRight"), { col: 1, row: 17 });
  // From day 1 at 9:00 left onto day 0, where 9:00 is busy: the earlier neighbour wins the tie.
  assert.deepEqual(moveInGrid(cells, { col: 1, row: 18 }, "ArrowLeft"), { col: 0, row: 17 });
  assert.equal(moveInGrid(cells, { col: 1, row: 18 }, "ArrowRight"), null);
  assert.deepEqual(moveInGrid(cells, { col: 1, row: 17 }, "Home"), { col: 0, row: 17 });
  assert.deepEqual(moveInGrid(cells, { col: 0, row: 19 }, "End"), { col: 1, row: 19 });
});

test("left and right skip a column with nothing free", () => {
  const cells: GridCell[] = [{ col: 0, row: 5 }, { col: 2, row: 5 }];
  assert.deepEqual(moveInGrid(cells, { col: 0, row: 5 }, "ArrowRight"), { col: 2, row: 5 });
  assert.deepEqual(moveInGrid(cells, { col: 2, row: 5 }, "ArrowLeft"), { col: 0, row: 5 });
});
