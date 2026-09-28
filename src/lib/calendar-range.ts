import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

/**
 * Which local days the calendar page shows. Dates are plain `YYYY-MM-DD`
 * strings and all arithmetic runs at UTC noon, so a daylight-saving change can
 * never move a date; only the two bounds become instants, through the viewer's
 * zone, which is where a 23- or 25-hour day is accounted for.
 */
export type CalendarView = "week" | "month";
export type CalendarRange = { view: CalendarView; anchor: string; today: string; month: string; days: string[]; timeMin: string; timeMax: string; prev: string; next: string; label: string };

const noon = (date: string) => new Date(`${date}T12:00:00.000Z`);
const format = (date: string, pattern: string) => formatInTimeZone(noon(date), "UTC", pattern);

export function addLocalDays(date: string, days: number) {
  const value = noon(date);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function addMonths(monthStart: string, months: number) {
  const value = noon(monthStart);
  value.setUTCMonth(value.getUTCMonth() + months, 1);
  return value.toISOString().slice(0, 10);
}

function startOfWeek(date: string, weekStartsOn: number) {
  return addLocalDays(date, -((noon(date).getUTCDay() - weekStartsOn + 7) % 7));
}

/**
 * A real calendar date in a sane range, or null. "2026-02-30" parses and rolls
 * to March, so the round trip is compared. The year is bounded because the date
 * comes from the URL: year 0000 steps into year -1, whose ISO form no longer
 * sorts like a date, and the day loop below would never end.
 */
function validDate(value: string | undefined) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const year = Number(value.slice(0, 4));
  if (year < 1900 || year > 2200) return null;
  const parsed = noon(value);
  return Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value ? null : value;
}

function weekLabel(first: string, last: string) {
  if (first.slice(0, 7) === last.slice(0, 7)) return `${format(first, "MMM d")} – ${format(last, "d, yyyy")}`;
  if (first.slice(0, 4) === last.slice(0, 4)) return `${format(first, "MMM d")} – ${format(last, "MMM d, yyyy")}`;
  return `${format(first, "MMM d, yyyy")} – ${format(last, "MMM d, yyyy")}`;
}

export function resolveCalendarRange(input: { view?: string; date?: string }, now: Date, timeZone: string, weekStartsOn: number): CalendarRange {
  const view: CalendarView = input.view === "month" ? "month" : "week";
  const today = formatInTimeZone(now, timeZone, "yyyy-MM-dd");
  const anchor = validDate(input.date) ?? today;
  let first: string, end: string, prev: string, next: string, label: string;

  if (view === "week") {
    first = startOfWeek(anchor, weekStartsOn);
    end = addLocalDays(first, 7);
    prev = addLocalDays(first, -7);
    next = end;
    label = weekLabel(first, addLocalDays(first, 6));
  } else {
    const monthStart = `${anchor.slice(0, 7)}-01`;
    next = addMonths(monthStart, 1);
    prev = addMonths(monthStart, -1);
    first = startOfWeek(monthStart, weekStartsOn);
    end = addLocalDays(startOfWeek(addLocalDays(next, -1), weekStartsOn), 7);
    label = format(monthStart, "MMMM yyyy");
  }

  const days: string[] = [];
  // Bounded as well as terminated: a month grid is at most six weeks.
  for (let day = first; day < end && days.length < 42; day = addLocalDays(day, 1)) days.push(day);
  return {
    view, anchor, today, month: anchor.slice(0, 7), days, prev, next, label,
    timeMin: fromZonedTime(`${first}T00:00:00`, timeZone).toISOString(),
    timeMax: fromZonedTime(`${end}T00:00:00`, timeZone).toISOString(),
  };
}
