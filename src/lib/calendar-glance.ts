import { addDays } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { findClashes, type CalendarEvent } from "./calendar-clash";

/**
 * The dashboard's "From your calendar" list: events from now to the end of the
 * seventh local day, grouped by the viewer's local day. A multi-day event is
 * listed once, on the first day it is visible, rather than repeated.
 */
export type GlanceShift = { id: string; jobName: string; startsAt: string; endsAt: string };
export type GlanceRow = { event: CalendarEvent; overlapsJob: string | null };
export type GlanceDay = { key: string; label: string; rows: GlanceRow[] };

const localDay = (date: Date | string, timeZone: string) => formatInTimeZone(date, timeZone, "yyyy-MM-dd");

export function glanceWindow(now: Date, timeZone: string) {
  const today = localDay(now, timeZone);
  const end = fromZonedTime(`${formatInTimeZone(addDays(fromZonedTime(`${today}T12:00:00`, timeZone), 8), timeZone, "yyyy-MM-dd")}T00:00:00`, timeZone);
  return { timeMin: now.toISOString(), timeMax: end.toISOString() };
}

export function buildGlance(events: CalendarEvent[], shifts: GlanceShift[], now: Date, timeZone: string, limit = 8) {
  const today = localDay(now, timeZone);
  const tomorrow = localDay(addDays(fromZonedTime(`${today}T12:00:00`, timeZone), 1), timeZone);
  const visible = events.filter((event) => !event.declined && Date.parse(event.endsAt) > now.getTime()).sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  const shown = visible.slice(0, limit);
  const days = new Map<string, GlanceDay>();

  for (const event of shown) {
    const key = Date.parse(event.startsAt) < now.getTime() ? today : localDay(event.startsAt, timeZone);
    const label = key === today ? "Today" : key === tomorrow ? "Tomorrow" : formatInTimeZone(fromZonedTime(`${key}T12:00:00`, timeZone), timeZone, "EEE MMM d");
    const overlap = event.allDay ? undefined : shifts.find((shift) => findClashes(shift, [event]).length > 0);
    const day = days.get(key) ?? { key, label, rows: [] };
    day.rows.push({ event, overlapsJob: overlap?.jobName ?? null });
    days.set(key, day);
  }

  return { days: [...days.values()].sort((a, b) => a.key.localeCompare(b.key)), hidden: visible.length - shown.length };
}
