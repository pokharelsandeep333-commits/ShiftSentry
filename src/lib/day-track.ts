import { formatInTimeZone } from "date-fns-tz";

/**
 * The maths behind the shift editor's day picker and 24-hour track. Pure, so
 * the drag and keyboard behaviour is tested without a browser.
 *
 * A selection is two wall-clock minutes counted from midnight of the start
 * date: `start` in [0, 1440), `end` after it and at most 24 hours later, so an
 * overnight shift simply has `end` past 1440. Wall-clock, not elapsed: the
 * track draws a day as 24 even hours, and the form stores local times that the
 * server turns into instants through the viewer's zone, so a daylight-saving
 * night still saves exactly what was picked.
 */

export const DAY_MINUTES = 24 * 60;
/** Every drag and arrow key moves by a quarter hour; Shift+arrow by an hour. */
export const SNAP_MINUTES = 15;

export type Selection = { start: number; end: number };
export type LocalParts = { date: string; time: string };

function pad(value: number) {
  return String(value).padStart(2, "0");
}

/** A `YYYY-MM-DD` moved by whole days, through UTC noon so no zone shift can slip it. */
export function addLocalDays(date: string, days: number) {
  const [year, month, day] = date.split("-").map(Number);
  const moved = new Date(Date.UTC(year, month - 1, day + days, 12));
  return `${moved.getUTCFullYear()}-${pad(moved.getUTCMonth() + 1)}-${pad(moved.getUTCDate())}`;
}

/** 0 = Sunday, as `week_starts_on` counts. */
export function weekdayOf(date: string) {
  const [year, month, day] = date.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day, 12)).getUTCDay();
}

/** The first date of the week holding `date`, for the viewer's week-start day. */
export function weekStartDate(date: string, weekStartsOn: number) {
  return addLocalDays(date, -((weekdayOf(date) - weekStartsOn + 7) % 7));
}

export function weekDates(start: string) {
  return Array.from({ length: 7 }, (_, index) => addLocalDays(start, index));
}

/** "14:30" as minutes since midnight, or null when it is not a clock time. */
export function minuteOf(time: string) {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return null;
  const minutes = Number(match[1]) * 60 + Number(match[2]);
  return Number(match[1]) < 24 && Number(match[2]) < 60 ? minutes : null;
}

/** Minutes since midnight as "HH:mm", wrapping past midnight. */
export function timeOf(minute: number) {
  const wrapped = ((Math.round(minute) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  return `${pad(Math.floor(wrapped / 60))}:${pad(wrapped % 60)}`;
}

/** "8:00 AM", "12:15 PM". */
export function clockLabel(minute: number) {
  const wrapped = ((Math.round(minute) % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
  const hours = Math.floor(wrapped / 60);
  return `${hours % 12 || 12}:${pad(wrapped % 60)} ${hours < 12 ? "AM" : "PM"}`;
}

export function snap(minute: number, step = SNAP_MINUTES) {
  return Math.round(minute / step) * step;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function daysBetween(from: string, to: string) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** The form's start and end as a selection on the start date's track, or null until both are set. */
export function selectionOf(startsAt: LocalParts, endsAt: LocalParts): Selection | null {
  const start = minuteOf(startsAt.time);
  const end = minuteOf(endsAt.time);
  if (start === null || end === null || !startsAt.date || !endsAt.date) return null;
  const total = end + daysBetween(startsAt.date, endsAt.date) * DAY_MINUTES;
  return total > start ? { start, end: total } : null;
}

/** A selection on `date`'s track back into the form's start and end. */
export function scheduleOf(date: string, selection: Selection): { startsAt: LocalParts; endsAt: LocalParts } {
  return {
    startsAt: { date, time: timeOf(selection.start) },
    endsAt: { date: addLocalDays(date, Math.floor(selection.end / DAY_MINUTES)), time: timeOf(selection.end) },
  };
}

/** Drawing out a new shift from where the press began to where the pointer is. Null until it spans a step. */
export function drawSelection(anchor: number, pointer: number): Selection | null {
  const a = clamp(snap(anchor), 0, DAY_MINUTES);
  const b = clamp(snap(pointer), 0, DAY_MINUTES);
  if (a === b) return null;
  return { start: Math.min(Math.min(a, b), DAY_MINUTES - SNAP_MINUTES), end: Math.max(a, b) };
}

/** A tap on the empty track: a shift of `length` minutes starting at the snapped point. */
export function placeSelection(at: number, length: number): Selection {
  const start = clamp(snap(at), 0, DAY_MINUTES - SNAP_MINUTES);
  return { start, end: start + clamp(snap(length), SNAP_MINUTES, DAY_MINUTES) };
}

/** Dragging the whole shift: its length stays, its start stays on this day. */
export function moveSelection(selection: Selection, start: number): Selection {
  const length = selection.end - selection.start;
  const next = clamp(snap(start), 0, DAY_MINUTES - SNAP_MINUTES);
  return { start: next, end: next + length };
}

/** The start handle: at least a step before the end, at most 24 hours before it, never before midnight. */
export function moveStart(selection: Selection, minute: number): Selection {
  return { start: clamp(snap(minute), Math.max(0, selection.end - DAY_MINUTES), Math.min(selection.end - SNAP_MINUTES, DAY_MINUTES - SNAP_MINUTES)), end: selection.end };
}

/** The end handle: at least a step after the start, at most 24 hours after it. */
export function moveEnd(selection: Selection, minute: number): Selection {
  return { start: selection.start, end: clamp(snap(minute), selection.start + SNAP_MINUTES, selection.start + DAY_MINUTES) };
}

/** A minute as a left offset on the track, clipped to the day. */
export function trackPercent(minute: number) {
  return (clamp(minute, 0, DAY_MINUTES) / DAY_MINUTES) * 100;
}

export type TrackShift = { id: string; jobName: string; color: string; startsAt: string; endsAt: string };
export type DayBlock = TrackShift & { start: number; end: number; fromBefore: boolean; continues: boolean };

/**
 * The shifts that touch `date`, placed on its track: an overnight shift from
 * the night before starts at midnight, one running into tomorrow ends at the
 * track's end, and both say so.
 */
export function dayBlocks(date: string, shifts: TrackShift[], timeZone: string): DayBlock[] {
  const blocks: DayBlock[] = [];
  for (const shift of shifts) {
    const startDate = formatInTimeZone(shift.startsAt, timeZone, "yyyy-MM-dd");
    const endDate = formatInTimeZone(shift.endsAt, timeZone, "yyyy-MM-dd");
    const endTime = minuteOf(formatInTimeZone(shift.endsAt, timeZone, "HH:mm")) ?? 0;
    if (startDate > date || endDate < date || (endDate === date && startDate < date && endTime === 0)) continue;
    const fromBefore = startDate < date;
    const continues = endDate > date && !(endTime === 0 && daysBetween(date, endDate) === 1);
    const start = fromBefore ? 0 : minuteOf(formatInTimeZone(shift.startsAt, timeZone, "HH:mm")) ?? 0;
    const end = endDate > date ? DAY_MINUTES : endTime;
    if (end > start) blocks.push({ ...shift, start, end, fromBefore, continues });
  }
  return blocks.sort((a, b) => a.start - b.start);
}

/** Whether the selection would sit on top of a block already on the track (half-open, as the database checks). */
export function overlapsBlock(selection: Selection, blocks: DayBlock[]) {
  return blocks.some((block) => selection.start < block.end && block.start < Math.min(selection.end, DAY_MINUTES));
}
