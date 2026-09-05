import { addMonths } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";

/**
 * Month keys are `YYYY-MM`, so ordering and range tests are plain string
 * comparisons -- no date parsing on the hot path when the client re-totals a
 * range on every menu selection.
 */
export function monthKeyOf(date: Date, timeZone: string) {
  return formatInTimeZone(date, timeZone, "yyyy-MM");
}

/**
 * Anchored at noon UTC before `addMonths` touches it, for the same reason
 * `addLocalDays` is in time.ts: date-fns works in the server's zone, and a
 * month anchored at local midnight can roll onto the previous day on a UTC box.
 */
function monthAtNoon(key: string) {
  return new Date(`${key}-01T12:00:00Z`);
}

export function shiftMonthKey(key: string, delta: number) {
  return formatInTimeZone(addMonths(monthAtNoon(key), delta), "UTC", "yyyy-MM");
}

export function monthKeyLabel(key: string) {
  return formatInTimeZone(monthAtNoon(key), "UTC", "MMM yyyy");
}

/** Every key from `from` through `to`, inclusive; empty when the pair is inverted. */
export function monthKeysBetween(from: string, to: string) {
  const keys: string[] = [];
  for (let key = from; key <= to; key = shiftMonthKey(key, 1)) keys.push(key);
  return keys;
}

export const EARNINGS_RANGE_PRESETS = [
  { key: "week", label: "This week" },
  { key: "thisMonth", label: "This month" },
  { key: "last3", label: "Last 3 months" },
  { key: "last6", label: "Last 6 months" },
  { key: "yearToDate", label: "Year to date" },
  { key: "allTime", label: "All time" },
  { key: "custom", label: "Custom months…" },
] as const;

export type EarningsRangePreset = typeof EARNINGS_RANGE_PRESETS[number]["key"];

/** Presets that resolve to a span of whole months, as opposed to the week. */
export type MonthRangePreset = Exclude<EarningsRangePreset, "week" | "custom">;

/**
 * The inclusive month span a preset covers, or null when there is no history.
 *
 * "Last 3 months" counts the month in progress and the two before it, matching
 * the six-month chart, which has always included the current month. Counting
 * three *completed* months instead would make the headline figure disagree with
 * the bars sitting next to it.
 */
export function monthRangeForPreset(preset: MonthRangePreset, months: readonly { key: string }[]) {
  const first = months[0]?.key;
  const last = months[months.length - 1]?.key;
  if (!first || !last) return null;

  const from = preset === "thisMonth" ? last
    : preset === "last3" ? shiftMonthKey(last, -2)
    : preset === "last6" ? shiftMonthKey(last, -5)
    : preset === "yearToDate" ? `${last.slice(0, 4)}-01`
    : first;

  // Clamped so a preset reaching past the first month worked does not claim a
  // wider span than the numbers under it actually cover.
  return { from: from < first ? first : from, to: last };
}

/**
 * The months inside a span. The pair is ordered here rather than validated at
 * the picker, so choosing an end month earlier than the start reads as the
 * range between them instead of silently emptying the card.
 */
export function selectMonths<T extends { key: string }>(months: readonly T[], from: string, to: string) {
  const [start, end] = from <= to ? [from, to] : [to, from];
  return months.filter((month) => month.key >= start && month.key <= end);
}

export function monthSpanLabel(from: string, to: string) {
  const [start, end] = from <= to ? [from, to] : [to, from];
  if (start === end) return monthKeyLabel(start);
  // Within one year the year is printed once: "Mar – Aug 2026".
  const startLabel = monthKeyLabel(start);
  return `${start.slice(0, 4) === end.slice(0, 4) ? startLabel.slice(0, 3) : startLabel} – ${monthKeyLabel(end)}`;
}
