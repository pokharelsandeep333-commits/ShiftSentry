import { formatInTimeZone } from "date-fns-tz";

export function greetingForDate(date: Date, timeZone: string) {
  const hour = Number(formatInTimeZone(date, timeZone, "H"));

  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}
