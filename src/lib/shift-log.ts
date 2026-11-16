/** Weeks loaded per page of the shift log. "Load older weeks" adds another batch. */
export const WEEKS_PER_PAGE = 8;

/** Roughly five years, so a hand-edited `?weeks=` cannot ask for an unbounded scan. */
export const MAX_WEEKS = 260;

/**
 * How far back the log is showing. The page reads it from the query string and
 * `deleteShift` reads it from a hidden field so it can redirect back to the same
 * depth -- both clamp identically, so a hand-edited value cannot widen the scan
 * by going through the form instead of the URL.
 */
export function clampWeeks(value: unknown) {
  const requested = Number(value);
  return Number.isFinite(requested) ? Math.min(Math.max(Math.trunc(requested), WEEKS_PER_PAGE), MAX_WEEKS) : WEEKS_PER_PAGE;
}

/** Which shifts the log lists: everything, ones still to come, or ones already started. */
export const SHIFT_SHOWS = ["all", "upcoming", "worked"] as const;
export type ShiftShow = (typeof SHIFT_SHOWS)[number];
export type ShiftFilters = { show: ShiftShow; job: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function firstValue(value: unknown) {
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0] : "";
  return typeof value === "string" ? value : "";
}

/**
 * The log's filters, read the same way from the URL and from `deleteShift`'s
 * hidden fields, so a delete lands back on the same filtered view. Anything
 * unrecognised means no filter; `job` must look like an id (whether it is one
 * of the viewer's jobs is RLS's business, and a stranger's id just matches
 * nothing).
 */
export function readShiftFilters(get: (name: string) => unknown): ShiftFilters {
  const show = firstValue(get("show"));
  const job = firstValue(get("job"));
  return {
    show: (SHIFT_SHOWS as readonly string[]).includes(show) ? show as ShiftShow : "all",
    job: UUID.test(job) ? job.toLowerCase() : "",
  };
}

export function isFiltered(filters: ShiftFilters) {
  return filters.show !== "all" || filters.job !== "";
}

/** The log's address for a depth and filters, defaults left out, plus any extra flags (`saved`). */
export function shiftLogHref(weeks: number, filters: ShiftFilters, extra: Record<string, string> = {}) {
  const params = new URLSearchParams();
  if (weeks !== WEEKS_PER_PAGE) params.set("weeks", String(weeks));
  if (filters.show !== "all") params.set("show", filters.show);
  if (filters.job) params.set("job", filters.job);
  for (const [key, value] of Object.entries(extra)) params.set(key, value);
  const query = params.toString();
  return query ? `/shifts?${query}` : "/shifts";
}

/**
 * Hours drawn by a full day column in a week's strip. Fixed rather than the
 * week's own maximum, so every week in the log is drawn to one scale and two
 * weeks can be compared at a glance. A longer day simply fills the column.
 */
export const DAY_SCALE_MINUTES = 10 * 60;

export type StripShift = { startsAt: string; endsAt: string; color: string; upcoming: boolean };
export type DaySegment = { color: string; minutes: number; upcoming: boolean };
export type DayShape = { date: string; minutes: number; segments: DaySegment[] };

const MINUTES_PER_DAY = 24 * 60;

function minutesBetween(startsAt: string, endsAt: string) {
  return Math.max(0, Math.round((new Date(endsAt).getTime() - new Date(startsAt).getTime()) / 60000));
}

/**
 * The seven days of a week for its hour strip, each with its shifts' minutes by
 * job colour, worked before upcoming. A shift sits wholly on the local day it
 * starts, as the list below the strip files it. Days are named at local noon,
 * which no daylight-saving change can push onto a neighbouring date.
 */
export function weekShape(weekStart: Date, shifts: StripShift[], timeZone: string, formatDate: (instant: Date, timeZone: string) => string): DayShape[] {
  const days: DayShape[] = Array.from({ length: 7 }, (_, index) => ({
    date: formatDate(new Date(weekStart.getTime() + (12 + 24 * index) * 3_600_000), timeZone),
    minutes: 0,
    segments: [],
  }));
  const byDate = new Map(days.map((day) => [day.date, day]));
  for (const shift of shifts) {
    const day = byDate.get(formatDate(new Date(shift.startsAt), timeZone));
    if (!day) continue;
    const minutes = minutesBetween(shift.startsAt, shift.endsAt);
    day.minutes += minutes;
    const same = day.segments.find((segment) => segment.color === shift.color && segment.upcoming === shift.upcoming);
    if (same) same.minutes += minutes;
    else day.segments.push({ color: shift.color, minutes, upcoming: shift.upcoming });
  }
  for (const day of days) day.segments.sort((a, b) => Number(a.upcoming) - Number(b.upcoming));
  return days;
}

/** A segment's share of a day column, as a percentage of its height. */
export function dayFill(minutes: number) {
  return Math.min(100, (minutes / DAY_SCALE_MINUTES) * 100);
}

/**
 * Where a shift sits on a 24-hour rail of the local day it starts: `left` and
 * `width` are percentages, and `continues` marks a shift that runs past
 * midnight, whose bar is cut at the rail's end. `startMinute` is the local
 * minute of the day the shift starts on (0-1439).
 */
export function railPosition(startMinute: number, durationMinutes: number) {
  const start = Math.min(Math.max(Math.trunc(startMinute), 0), MINUTES_PER_DAY - 1);
  const shown = Math.min(Math.max(durationMinutes, 0), MINUTES_PER_DAY - start);
  return { left: (start / MINUTES_PER_DAY) * 100, width: (shown / MINUTES_PER_DAY) * 100, continues: durationMinutes > shown };
}
