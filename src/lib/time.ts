import { addDays } from "date-fns";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";

export type MinuteAllocation = { date: string; minutes: number };

function localDate(date: Date, timeZone: string) {
  return formatInTimeZone(date, timeZone, "yyyy-MM-dd");
}

function midnightUtc(localDay: string, timeZone: string) {
  return fromZonedTime(`${localDay}T00:00:00`, timeZone);
}

/** Split a UTC shift at user-local midnights, preserving its exact duration. */
export function allocateShiftMinutes(startsAt: Date, endsAt: Date, timeZone: string): MinuteAllocation[] {
  const allocations: MinuteAllocation[] = [];
  let cursor = startsAt;

  while (cursor < endsAt) {
    const cursorDay = localDate(cursor, timeZone);
    const nextLocalDay = formatInTimeZone(addDays(new Date(`${cursorDay}T12:00:00Z`), 1), "UTC", "yyyy-MM-dd");
    const boundary = midnightUtc(nextLocalDay, timeZone);
    const segmentEnd = boundary > cursor && boundary < endsAt ? boundary : endsAt;
    allocations.push({ date: cursorDay, minutes: Math.round((segmentEnd.getTime() - cursor.getTime()) / 60_000) });
    cursor = segmentEnd;
  }
  return allocations;
}

export function weekStartFor(date: Date, timeZone: string, weekStartsOn: number) {
  const day = localDate(date, timeZone);
  const weekday = new Date(`${day}T12:00:00Z`).getUTCDay();
  const daysSinceStart = (weekday - weekStartsOn + 7) % 7;
  const startDay = formatInTimeZone(addDays(new Date(`${day}T12:00:00Z`), -daysSinceStart), "UTC", "yyyy-MM-dd");
  return midnightUtc(startDay, timeZone);
}

export function weekEndFor(date: Date, timeZone: string, weekStartsOn: number) {
  return addDays(weekStartFor(date, timeZone, weekStartsOn), 7);
}

export function percentage(usedMinutes: number, limitMinutes: number | null) {
  return limitMinutes ? Math.round((usedMinutes / limitMinutes) * 100) : 0;
}
