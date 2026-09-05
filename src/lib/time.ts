import { addDays } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export type MinuteAllocation = { date: string; minutes: number };

function localDate(date: Date, timeZone: string) {
  return formatInTimeZone(date, timeZone, "yyyy-MM-dd");
}

function midnightUtc(localDay: string, timeZone: string) {
  return fromZonedTime(`${localDay}T00:00:00`, timeZone);
}

/**
 * Move a local calendar day by whole days.
 *
 * Every date here is anchored at noon UTC before `addDays` touches it. `addDays`
 * works in the *server's* zone, so anchoring at a local midnight would make the
 * result depend on where the server happens to run: on a machine set to the
 * user's zone it lands on the right instant, and on a UTC container a week
 * containing a DST change comes out an hour off. Noon is far enough from either
 * boundary that a one-hour shift cannot change the UTC date, so reading the day
 * back in UTC is exact in every zone.
 */
function addLocalDays(localDay: string, days: number) {
  return formatInTimeZone(addDays(new Date(`${localDay}T12:00:00Z`), days), "UTC", "yyyy-MM-dd");
}

/** How many days into the week a local day falls, given the profile's first day. */
function daysIntoWeek(localDay: string, weekStartsOn: number) {
  return (new Date(`${localDay}T12:00:00Z`).getUTCDay() - weekStartsOn + 7) % 7;
}

/** Split a UTC shift at user-local midnights, preserving its exact duration. */
export function allocateShiftMinutes(startsAt: Date, endsAt: Date, timeZone: string): MinuteAllocation[] {
  const allocations: MinuteAllocation[] = [];
  let cursor = startsAt;

  while (cursor < endsAt) {
    const cursorDay = localDate(cursor, timeZone);
    const boundary = midnightUtc(addLocalDays(cursorDay, 1), timeZone);
    const segmentEnd = boundary > cursor && boundary < endsAt ? boundary : endsAt;
    allocations.push({ date: cursorDay, minutes: Math.round((segmentEnd.getTime() - cursor.getTime()) / 60_000) });
    cursor = segmentEnd;
  }
  return allocations;
}

export function weekStartFor(date: Date, timeZone: string, weekStartsOn: number) {
  const day = localDate(date, timeZone);
  return midnightUtc(addLocalDays(day, -daysIntoWeek(day, weekStartsOn)), timeZone);
}

/**
 * The local midnight that ends the week -- derived from the week's own calendar
 * days rather than by adding 168 hours to its start, because a week containing
 * a DST change is 167 or 169 hours long.
 */
export function weekEndFor(date: Date, timeZone: string, weekStartsOn: number) {
  const day = localDate(date, timeZone);
  return midnightUtc(addLocalDays(day, 7 - daysIntoWeek(day, weekStartsOn)), timeZone);
}

export function percentage(usedMinutes: number, limitMinutes: number | null) {
  return limitMinutes ? Math.round((usedMinutes / limitMinutes) * 100) : 0;
}
