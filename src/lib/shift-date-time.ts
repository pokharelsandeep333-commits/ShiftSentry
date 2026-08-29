export type LocalDateTime = {
  date: string;
  time: string;
  value: string;
  formatted: string;
};

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function isValidDate(year: number, month: number, day: number) {
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return candidate.getUTCFullYear() === year && candidate.getUTCMonth() === month - 1 && candidate.getUTCDate() === day;
}

function fromTwentyFourHour(year: number, month: number, day: number, hour: number, minute: number): LocalDateTime | null {
  if (!isValidDate(year, month, day) || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;

  const date = `${year}-${pad(month)}-${pad(day)}`;
  const time = `${pad(hour)}:${pad(minute)}`;
  const displayHour = hour % 12 || 12;
  const meridiem = hour < 12 ? "AM" : "PM";

  return {
    date,
    time,
    value: `${date}T${time}`,
    formatted: `${pad(month)}/${pad(day)}/${year} ${pad(displayHour)}:${pad(minute)} ${meridiem}`,
  };
}

function fromTwelveHour(year: number, month: number, day: number, hour: number, minute: number, meridiem: string) {
  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;
  const normalizedMeridiem = meridiem.toUpperCase();
  if (normalizedMeridiem !== "AM" && normalizedMeridiem !== "PM") return null;
  const hour24 = hour % 12 + (normalizedMeridiem === "PM" ? 12 : 0);
  return fromTwentyFourHour(year, month, day, hour24, minute);
}

function parseCompactInput(value: string) {
  const compact = /^([0-9]+)(am|pm)$/i.exec(value.replace(/\s+/g, ""));
  if (!compact) return null;

  const digits = compact[1];
  const meridiem = compact[2];
  const matches: LocalDateTime[] = [];

  for (const timeLength of [4, 3]) {
    const dateAndYear = digits.slice(0, -timeLength);
    const timeDigits = digits.slice(-timeLength);
    if (dateAndYear.length < 6) continue;

    const yearDigits = dateAndYear.slice(-4);
    const monthDayDigits = dateAndYear.slice(0, -4);
    if (monthDayDigits.length < 2 || monthDayDigits.length > 4) continue;

    const monthLength = monthDayDigits.length === 4 ? 2 : 1;
    const month = Number(monthDayDigits.slice(0, monthLength));
    const day = Number(monthDayDigits.slice(monthLength));
    const year = Number(yearDigits);
    const hour = Number(timeDigits.slice(0, -2));
    const minute = Number(timeDigits.slice(-2));
    const parsed = fromTwelveHour(year, month, day, hour, minute, meridiem);
    if (parsed) matches.push(parsed);
  }

  return matches.length === 1 ? matches[0] : null;
}

/** Accepts native values, 08/25/2026 03:00 PM, and compact 8252026300pm input. */
export function parseShiftDateTimeInput(input: string): LocalDateTime | null {
  const value = input.trim();
  if (!value) return null;

  const native = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (native) return fromTwentyFourHour(Number(native[1]), Number(native[2]), Number(native[3]), Number(native[4]), Number(native[5]));

  const formatted = /^(\d{1,2})\s*[/.\-]\s*(\d{1,2})\s*[/.\-]\s*(\d{4})\s+(\d{1,2})\s*:\s*(\d{2})\s*([ap]m)$/i.exec(value);
  if (formatted) return fromTwelveHour(Number(formatted[3]), Number(formatted[1]), Number(formatted[2]), Number(formatted[4]), Number(formatted[5]), formatted[6]);

  return parseCompactInput(value);
}

export function formatShiftDateOnly(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match || !isValidDate(Number(match[1]), Number(match[2]), Number(match[3]))) return "";
  return `${match[2]}/${match[3]}/${match[1]}`;
}

export function combineShiftDateAndTime(date: string, time: string) {
  return parseShiftDateTimeInput(`${date}T${time}`)?.value ?? "";
}

export function formatShiftDateAndTime(date: string, time: string) {
  const combined = combineShiftDateAndTime(date, time);
  if (combined) return parseShiftDateTimeInput(combined)?.formatted ?? "";
  return formatShiftDateOnly(date);
}

/**
 * The same wall-clock time N weeks later. Bumping the local calendar date
 * rather than adding 168 hours per week keeps a repeat landing at the same hour
 * even when a DST change falls inside the span. Returns "" for unparseable
 * input so callers can skip the occurrence.
 */
export function addWeeksToLocalDateTime(value: string, weeks: number) {
  const parsed = parseShiftDateTimeInput(value);
  if (!parsed || !Number.isInteger(weeks)) return "";
  const [year, month, day] = parsed.date.split("-").map(Number);
  const bumped = new Date(Date.UTC(year, month - 1, day));
  bumped.setUTCDate(bumped.getUTCDate() + weeks * 7);
  return `${bumped.toISOString().slice(0, 10)}T${parsed.time}`;
}

export function synchronizedEndDate(startDate: string, endDateFollowsStart: boolean) {
  return endDateFollowsStart && formatShiftDateOnly(startDate) ? startDate : null;
}
