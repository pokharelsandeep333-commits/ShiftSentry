import type { CalendarEvent } from "./calendar-clash";
import { isSameShift } from "./shift-match";

/**
 * What one sync run should change, decided without touching the network or
 * the database, so every rule here is unit-tested. For each job that syncs:
 *
 *   - an event with no shift yet adopts a matching hand-typed shift of that job
 *     (start and end each within 15 minutes) or else becomes a new shift;
 *   - an upcoming synced shift follows its event's times and job;
 *   - a synced shift that has started is history and is never touched;
 *   - an upcoming synced shift whose event is gone is removed -- but only when
 *     its calendar loaded, so a Google outage can never delete shifts;
 *   - an event the user deleted here (the job's ignore list) stays deleted;
 *   - an event longer than the 24-hour shift limit is reported, not created.
 *
 * Refusals by the database (caps, overlaps) happen when the plan is applied.
 */
export type SyncJob = { id: string; name: string; keyword: string | null; calendarId: string | null; sync: boolean; ignored: string[] };
export type LinkedShift = { id: string; jobId: string; startsAt: string; endsAt: string; calendarId: string | null; eventId: string | null };
export type SyncIssue = { jobName: string; startsAt: string; endsAt: string; reason: string };
export type SyncPlan = {
  create: { jobId: string; startsAt: string; endsAt: string; calendarId: string; eventId: string }[];
  adopt: { shiftId: string; calendarId: string; eventId: string }[];
  update: { shiftId: string; jobId: string; startsAt: string; endsAt: string }[];
  remove: string[];
  issues: SyncIssue[];
};

const DAY_MS = 24 * 60 * 60_000;
const keyOf = (calendarId: string, eventId: string) => `${calendarId}:${eventId}`;
const keywordOf = (job: SyncJob) => (job.keyword ?? job.name).trim().toLowerCase();

/** The job an event belongs to by title keyword and calendar; the longest keyword wins, ties by name. */
export function jobForEvent(event: CalendarEvent, jobs: SyncJob[], selectedCalendarIds: string[]): SyncJob | null {
  if (event.allDay || event.declined) return null;
  const title = event.title.toLowerCase();
  return jobs
    .filter((job) => keywordOf(job).length > 0 && title.includes(keywordOf(job)))
    .filter((job) => (job.calendarId ? event.calendarId === job.calendarId : selectedCalendarIds.includes(event.calendarId)))
    .sort((a, b) => keywordOf(b).length - keywordOf(a).length || a.name.localeCompare(b.name))[0] ?? null;
}

export function planShiftSync({ events, jobs, shifts, selectedCalendarIds, failedCalendarIds, now }: { events: CalendarEvent[]; jobs: SyncJob[]; shifts: LinkedShift[]; selectedCalendarIds: string[]; failedCalendarIds: string[]; now: Date }): SyncPlan {
  const syncJobs = jobs.filter((job) => job.sync);
  const syncJobIds = new Set(syncJobs.map((job) => job.id));
  const linked = new Map(shifts.filter((shift) => shift.calendarId && shift.eventId).map((shift) => [keyOf(shift.calendarId!, shift.eventId!), shift]));
  const started = (shift: LinkedShift) => Date.parse(shift.startsAt) <= now.getTime();
  const plan: SyncPlan = { create: [], adopt: [], update: [], remove: [], issues: [] };
  const seen = new Set<string>();
  const adopted = new Set<string>();

  for (const event of [...events].sort((a, b) => a.startsAt.localeCompare(b.startsAt))) {
    const job = jobForEvent(event, syncJobs, selectedCalendarIds);
    if (!job) continue;
    const key = keyOf(event.calendarId, event.id);
    if (job.ignored.includes(key)) continue;
    seen.add(key);

    if (Date.parse(event.endsAt) - Date.parse(event.startsAt) > DAY_MS) {
      plan.issues.push({ jobName: job.name, startsAt: event.startsAt, endsAt: event.endsAt, reason: "longer than 24 hours" });
      continue;
    }

    const existing = linked.get(key);
    if (existing) {
      // Instants, not strings: PostgREST returns "+00:00" where Google gives "Z".
      const changed = Date.parse(existing.startsAt) !== Date.parse(event.startsAt) || Date.parse(existing.endsAt) !== Date.parse(event.endsAt) || existing.jobId !== job.id;
      if (changed && !started(existing)) plan.update.push({ shiftId: existing.id, jobId: job.id, startsAt: event.startsAt, endsAt: event.endsAt });
      continue;
    }

    const handTyped = shifts.find((shift) => !shift.eventId && shift.jobId === job.id && !adopted.has(shift.id) && isSameShift(event, { jobName: "", startsAt: shift.startsAt, endsAt: shift.endsAt }));
    if (handTyped) {
      adopted.add(handTyped.id);
      plan.adopt.push({ shiftId: handTyped.id, calendarId: event.calendarId, eventId: event.id });
    } else {
      plan.create.push({ jobId: job.id, startsAt: event.startsAt, endsAt: event.endsAt, calendarId: event.calendarId, eventId: event.id });
    }
  }

  for (const [key, shift] of linked) {
    if (seen.has(key) || started(shift) || !syncJobIds.has(shift.jobId) || failedCalendarIds.includes(shift.calendarId!)) continue;
    plan.remove.push(shift.id);
  }
  return plan;
}
