import { addMinutesToLocalDateTime, parseShiftDateTimeInput } from "@/lib/shift-date-time";

/**
 * Quick add on the Calendar page: an empty slot opens Add shift already set to
 * that day and time. Everything here is local wall-clock time as plain
 * strings (`YYYY-MM-DD`, minutes after local midnight); `/shifts/new` reads
 * the result with `parseShiftDateTimeInput` and the form turns it into an
 * instant through the viewer's zone, as it does for typed times.
 */

/** The week grid's slot: a click or tap lands on the half hour it falls in. */
export const SLOT_MINUTES = 30;
export const SLOTS_PER_DAY = (24 * 60) / SLOT_MINUTES;
/** A quick-added shift starts this long; the form shows the end, ready to change. */
export const QUICK_ADD_MINUTES = 120;

const pad = (value: number) => String(value).padStart(2, "0");

/** Slot index for a minute of the day, rounded down to the slot; null outside 0..1439. */
export function slotForMinute(minute: number) {
  if (!Number.isFinite(minute) || minute < 0 || minute >= 24 * 60) return null;
  return Math.floor(minute / SLOT_MINUTES);
}

/** `HH:mm` at the start of a slot. */
export function slotTime(slot: number) {
  const minutes = slot * SLOT_MINUTES;
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

/** "9:00 AM" at the start of a slot, for labels. */
export function slotLabel(slot: number) {
  const minutes = slot * SLOT_MINUTES;
  const hour = Math.floor(minutes / 60);
  return `${hour % 12 || 12}:${pad(minutes % 60)} ${hour < 12 ? "AM" : "PM"}`;
}

/**
 * The Add shift link for a slot on a day: starts at the slot, runs
 * `QUICK_ADD_MINUTES` (past midnight when it must). These are the same
 * `startsAt` / `endsAt` parameters a Duplicate link uses. Null if the day or
 * slot is not real.
 */
export function quickAddHref(day: string, slot: number) {
  if (!Number.isInteger(slot) || slot < 0 || slot >= SLOTS_PER_DAY) return null;
  const start = parseShiftDateTimeInput(`${day}T${slotTime(slot)}`);
  if (!start) return null;
  const end = addMinutesToLocalDateTime(start.value, QUICK_ADD_MINUTES);
  return `/shifts/new?startsAt=${start.value}&endsAt=${end}`;
}

/** The Add shift link for a whole day (month view, phone list): date only, times left to pick. */
export function quickAddDayHref(day: string) {
  return parseShiftDateTimeInput(`${day}T00:00`) ? `/shifts/new?date=${day}` : null;
}

/**
 * Whether a slot is clear of every timed item on the day, given their wall-clock
 * spans in minutes (`layoutDay`'s `top` and `height`). A slot any item touches
 * is not offered: its block sits over it, and adding there would overlap.
 */
export function slotIsFree(slot: number, placed: { top: number; height: number }[]) {
  const start = slot * SLOT_MINUTES;
  const end = start + SLOT_MINUTES;
  return !placed.some(({ top, height }) => top < end && top + height > start);
}

/** The free slot nearest `preferred` (ties go later), or null when the day is full. */
export function nearestFreeSlot(preferred: number, placed: { top: number; height: number }[]) {
  for (let distance = 0; distance < SLOTS_PER_DAY; distance += 1) {
    for (const slot of [preferred + distance, preferred - distance]) {
      if (slot >= 0 && slot < SLOTS_PER_DAY && slotIsFree(slot, placed)) return slot;
    }
  }
  return null;
}

export type GridCell = { col: number; row: number };
export type GridKey = "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight" | "Home" | "End";

/**
 * Arrow-key movement over a grid with holes (busy slots are left out of
 * `cells`). Up and down stay in the column and skip to the next cell that
 * exists; left and right go to the nearest column that has a cell, landing on
 * the row nearest the current one; Home and End go to the first and last cell
 * in the row. Returns null when there is nowhere to go, so focus stays put.
 */
export function moveInGrid(cells: GridCell[], from: GridCell, key: GridKey): GridCell | null {
  const pick = (candidates: GridCell[], score: (cell: GridCell) => number) =>
    candidates.reduce<GridCell | null>((best, cell) => (best === null || score(cell) < score(best) ? cell : best), null);

  switch (key) {
    case "ArrowUp":
      return pick(cells.filter((cell) => cell.col === from.col && cell.row < from.row), (cell) => from.row - cell.row);
    case "ArrowDown":
      return pick(cells.filter((cell) => cell.col === from.col && cell.row > from.row), (cell) => cell.row - from.row);
    case "ArrowLeft":
    case "ArrowRight": {
      const direction = key === "ArrowLeft" ? -1 : 1;
      const ahead = cells.filter((cell) => (cell.col - from.col) * direction > 0);
      const column = pick(ahead, (cell) => Math.abs(cell.col - from.col))?.col;
      if (column === undefined) return null;
      // Equal distance prefers the earlier row, so a step across lands consistently.
      return pick(ahead.filter((cell) => cell.col === column), (cell) => Math.abs(cell.row - from.row) * 2 + (cell.row > from.row ? 1 : 0));
    }
    case "Home":
      return pick(cells.filter((cell) => cell.row === from.row), (cell) => cell.col);
    case "End":
      return pick(cells.filter((cell) => cell.row === from.row), (cell) => -cell.col);
  }
}
