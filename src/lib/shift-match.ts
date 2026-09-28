import { findClashes, type CalendarEvent } from "./calendar-clash";

/**
 * People keep their work shifts in Google Calendar too, often in the same
 * calendar as their classes. A Google event that *is* one of their ShiftSentry
 * shifts must not be drawn twice or reported as clashing with itself, so this
 * decides when an event and a shift are the same thing:
 *
 *   - its start and its end are each within 15 minutes of the shift's, whatever
 *     the title (a work app's "Shift" or "Work"), or
 *   - it overlaps the shift and its title contains the job's Google keyword
 *     (set per job; the job's name when unset).
 *
 * All-day and declined events are never a shift. The title rule also lets an
 * event with no ShiftSentry shift yet suggest which job to add it as.
 */
export const MATCH_TOLERANCE_MS = 15 * 60_000;

/** `keyword` is the job's Google title keyword; when unset, the job name is used. */
export type MatchShift = { id: string; jobName: string; keyword?: string | null; startsAt: string; endsAt: string };
export type MatchJob = { id: string; name: string; keyword?: string | null };

/**
 * The keyword appears in the title as whole words ("TA" in "TA shift", not in
 * "Statistics"), case-insensitive. Shorter than two characters never matches:
 * a one-letter keyword would claim half a calendar.
 */
export function titleHasKeyword(title: string, keyword: string) {
  const word = keyword.trim();
  if (word.length < 2) return false;
  const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\s+/g, "\\s+");
  return new RegExp(`(^|[^\\p{L}\\p{N}])${escaped}($|[^\\p{L}\\p{N}])`, "iu").test(title);
}
const titleHas = titleHasKeyword;
const distance = (event: CalendarEvent, shift: { startsAt: string; endsAt: string }) => Math.abs(Date.parse(event.startsAt) - Date.parse(shift.startsAt)) + Math.abs(Date.parse(event.endsAt) - Date.parse(shift.endsAt));

export function isSameShift(event: CalendarEvent, shift: { jobName: string; keyword?: string | null; startsAt: string; endsAt: string }) {
  if (event.allDay || event.declined) return false;
  const sameSpan = Math.abs(Date.parse(event.startsAt) - Date.parse(shift.startsAt)) <= MATCH_TOLERANCE_MS && Math.abs(Date.parse(event.endsAt) - Date.parse(shift.endsAt)) <= MATCH_TOLERANCE_MS;
  if (sameSpan) return true;
  return titleHas(event.title, shift.keyword ?? shift.jobName) && findClashes(shift, [{ ...event, free: false }]).length > 0;
}

/** Event key (`calendarId:id`) → the id of the closest shift it is a copy of. */
export function matchEventsToShifts(events: CalendarEvent[], shifts: MatchShift[]) {
  const matches = new Map<string, string>();
  for (const event of events) {
    let best: MatchShift | null = null;
    for (const shift of shifts) if (isSameShift(event, shift) && (!best || distance(event, shift) < distance(event, best))) best = shift;
    if (best) matches.set(`${event.calendarId}:${event.id}`, best.id);
  }
  return matches;
}

/** The job an unmatched event looks like, by name in its title; the longest name wins ("Campus desk" over "Desk"). */
export function suggestJob(event: CalendarEvent, jobs: MatchJob[]): MatchJob | null {
  if (event.allDay || event.declined) return null;
  const keyword = (job: MatchJob) => job.keyword ?? job.name;
  return jobs.filter((job) => titleHas(event.title, keyword(job))).sort((a, b) => keyword(b).length - keyword(a).length)[0] ?? null;
}
