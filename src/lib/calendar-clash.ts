import { fromZonedTime } from "date-fns-tz";

/**
 * Google events reduced to what ShiftSentry reads, and the one rule for when an
 * event clashes with a shift. Half-open like `shifts_no_overlap`: a shift that
 * ends as a class starts does not clash. All-day, "free" and declined events
 * never clash -- a birthday should not flag every shift that day.
 */
export type CalendarEvent = { id: string; calendarId: string; title: string; startsAt: string; endsAt: string; allDay: boolean; free: boolean; declined: boolean };

export type GoogleEventResource = {
  id?: string;
  status?: string;
  summary?: string;
  transparency?: string;
  start?: { date?: string; dateTime?: string };
  end?: { date?: string; dateTime?: string };
  attendees?: { self?: boolean; responseStatus?: string }[];
};

function instant(value: { date?: string; dateTime?: string } | undefined, timeZone: string) {
  if (value?.dateTime) {
    const date = new Date(value.dateTime);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  }
  if (value?.date && /^\d{4}-\d{2}-\d{2}$/.test(value.date)) return fromZonedTime(`${value.date}T00:00:00`, timeZone).toISOString();
  return null;
}

export function normalizeGoogleEvent(event: GoogleEventResource, calendarId: string, timeZone: string): CalendarEvent | null {
  if (!event.id || event.status === "cancelled") return null;
  const startsAt = instant(event.start, timeZone);
  const endsAt = instant(event.end, timeZone);
  if (!startsAt || !endsAt || endsAt <= startsAt) return null;
  return {
    id: event.id,
    calendarId,
    title: event.summary?.trim() || "(No title)",
    startsAt,
    endsAt,
    allDay: Boolean(event.start?.date && !event.start.dateTime),
    free: event.transparency === "transparent",
    declined: event.attendees?.some((attendee) => attendee.self && attendee.responseStatus === "declined") ?? false,
  };
}

export function findClashes(range: { startsAt: string; endsAt: string }, events: CalendarEvent[]) {
  const start = Date.parse(range.startsAt);
  const end = Date.parse(range.endsAt);
  return events
    .filter((event) => !event.allDay && !event.free && !event.declined)
    .filter((event) => Date.parse(event.startsAt) < end && start < Date.parse(event.endsAt))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}

/**
 * One result per selected calendar, merged. A calendar that fails on its own --
 * deleted, unshared, unsubscribed since it was ticked -- is skipped, so one
 * stale selection cannot switch the whole check off; only every calendar
 * failing, or an auth failure (which says the connection itself is bad), fails
 * the merge. The same event reached through two calendars is listed once.
 */
export function mergeCalendarResults(results: PromiseSettledResult<CalendarEvent[]>[], isAuthFailure: (reason: unknown) => boolean = () => false): CalendarEvent[] {
  const auth = results.find((result): result is PromiseRejectedResult => result.status === "rejected" && isAuthFailure(result.reason));
  if (auth) throw auth.reason;
  const fulfilled = results.filter((result): result is PromiseFulfilledResult<CalendarEvent[]> => result.status === "fulfilled");
  if (results.length > 0 && fulfilled.length === 0) throw (results[0] as PromiseRejectedResult).reason;
  const seen = new Set<string>();
  return fulfilled
    .flatMap((result) => result.value)
    .filter((event) => (seen.has(event.id) ? false : (seen.add(event.id), true)))
    .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
}
