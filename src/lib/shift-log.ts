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
