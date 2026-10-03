import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { weekStartFor } from "./time";

/**
 * Week notes are keyed on the local date their week starts on (`week_notes.
 * week_start`), the same week `weekStartFor` draws in the shift log.
 *
 * Changing the profile's week-start day moves every boundary, so a note saved
 * under the old start date no longer sits on one. It still sits inside exactly
 * one of the new weeks, so it is shown there and marked `legacy`; saving it
 * writes the new key and deletes the old row (saveWeekNote), which merges it
 * into the new grid instead of leaving a hidden duplicate behind.
 */
export type WeekNote = { id: string; week_start: string; body: string };

/** Matches `week_notes.body`'s check. Lives here, not in validation.ts, so the client editor can count against it without bundling Zod. */
export const WEEK_NOTE_MAX = 2000;
export type WeekNoteMatch = { id: string; body: string; legacy: boolean };

/** `YYYY-MM-DD` of the local day the week holding `instant` starts on. */
export function weekStartDate(instant: Date, timeZone: string, weekStartsOn: number) {
  return formatInTimeZone(weekStartFor(instant, timeZone, weekStartsOn), timeZone, "yyyy-MM-dd");
}

/**
 * The instant the week holding a local date starts. Read at local noon, which
 * no daylight-saving change can move to another day.
 */
export function weekStartOfLocalDate(date: string, timeZone: string, weekStartsOn: number) {
  return weekStartFor(fromZonedTime(`${date}T12:00:00`, timeZone), timeZone, weekStartsOn);
}

/** Days are compared as strings; noon UTC keeps the arithmetic off any boundary. */
function addDays(date: string, days: number) {
  const value = new Date(`${date}T12:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

/** The note for the week starting `weekStart`: the one saved on that date, else one saved inside the week. */
export function noteForWeek(notes: WeekNote[], weekStart: string): WeekNoteMatch | null {
  const exact = notes.find((note) => note.week_start === weekStart);
  if (exact) return { id: exact.id, body: exact.body, legacy: false };
  const end = addDays(weekStart, 7);
  const inside = notes.filter((note) => note.week_start > weekStart && note.week_start < end).sort((a, b) => a.week_start.localeCompare(b.week_start))[0];
  return inside ? { id: inside.id, body: inside.body, legacy: true } : null;
}

/** Whether a `YYYY-MM-DD` is a real date that starts a week under `weekStartsOn`. */
export function isWeekStart(date: string, weekStartsOn: number) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const value = new Date(`${date}T12:00:00.000Z`);
  return !Number.isNaN(value.getTime()) && value.toISOString().slice(0, 10) === date && value.getUTCDay() === weekStartsOn;
}
