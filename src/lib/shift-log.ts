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

/** Which shifts the log lists: everything, ones still to come, or ones already started. */
export const SHIFT_SHOWS = ["all", "upcoming", "worked"] as const;
export type ShiftShow = (typeof SHIFT_SHOWS)[number];
export type ShiftFilters = { show: ShiftShow; job: string };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function firstValue(value: unknown) {
  if (Array.isArray(value)) return typeof value[0] === "string" ? value[0] : "";
  return typeof value === "string" ? value : "";
}

/**
 * The log's filters, read the same way from the URL and from `deleteShift`'s
 * hidden fields, so a delete lands back on the same filtered view. Anything
 * unrecognised means no filter; `job` must look like an id (whether it is one
 * of the viewer's jobs is RLS's business, and a stranger's id just matches
 * nothing).
 */
export function readShiftFilters(get: (name: string) => unknown): ShiftFilters {
  const show = firstValue(get("show"));
  const job = firstValue(get("job"));
  return {
    show: (SHIFT_SHOWS as readonly string[]).includes(show) ? show as ShiftShow : "all",
    job: UUID.test(job) ? job.toLowerCase() : "",
  };
}

export function isFiltered(filters: ShiftFilters) {
  return filters.show !== "all" || filters.job !== "";
}

/** The log's address for a depth and filters, defaults left out, plus any extra flags (`saved`). */
export function shiftLogHref(weeks: number, filters: ShiftFilters, extra: Record<string, string> = {}) {
  const params = new URLSearchParams();
  if (weeks !== WEEKS_PER_PAGE) params.set("weeks", String(weeks));
  if (filters.show !== "all") params.set("show", filters.show);
  if (filters.job) params.set("job", filters.job);
  for (const [key, value] of Object.entries(extra)) params.set(key, value);
  const query = params.toString();
  return query ? `/shifts?${query}` : "/shifts";
}
