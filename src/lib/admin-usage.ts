/**
 * Date buckets for the admin usage charts, in UTC: these are platform totals
 * across every user's zone, so no one viewer's zone is the right one. The keys
 * match what Postgres returns for `to_char(date_trunc(...), 'YYYY-MM-DD')`,
 * whose weeks start on Monday (ISO).
 */
const DAY_MS = 86_400_000;

function utcDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

/** The last `count` UTC days, oldest first, ending today. */
export function lastUtcDays(now: Date, count: number) {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Array.from({ length: count }, (_, index) => utcDateKey(new Date(today - (count - 1 - index) * DAY_MS)));
}

/** The Mondays of the last `count` ISO weeks, oldest first, ending with this week's. */
export function lastUtcWeeks(now: Date, count: number) {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const sinceMonday = (new Date(today).getUTCDay() + 6) % 7;
  const monday = today - sinceMonday * DAY_MS;
  return Array.from({ length: count }, (_, index) => utcDateKey(new Date(monday - (count - 1 - index) * 7 * DAY_MS)));
}

/** Every key in order with its count, zero where the query returned no row. */
export function fillBuckets(keys: string[], rows: { bucket: string; count: number }[]) {
  const counts = new Map(rows.map((row) => [row.bucket, row.count]));
  return keys.map((key) => ({ key, count: counts.get(key) ?? 0 }));
}

/** "Oct 13", for an axis or a tooltip. The key is a UTC date, so format it in UTC. */
export function shortUtcDate(key: string) {
  return new Date(`${key}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}
