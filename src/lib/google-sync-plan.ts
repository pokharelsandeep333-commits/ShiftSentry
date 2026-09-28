import type { CalendarEvent } from "./calendar-clash";
import { isSameShift, titleHasKeyword } from "./shift-match";

/**
 * What one sync run should change, decided without touching the network or
 * the database, so every rule here is unit-tested. For each job that syncs:
 *
 *   - an event with no shift yet re-links the upcoming shift of an event that
 *     vanished at the same time (a work app republishing its schedule), else
 *     adopts a matching hand-typed shift of that job, else becomes a new shift;
 *   - an upcoming synced shift follows its event's times and job;
 *   - a synced shift that has started is history and is never touched;
 *   - an upcoming synced shift whose event is missing from this fetch is NOT
 *     removed here: missing is not deleted (the window, an unticked calendar, a
 *     keyword edit). It goes to `verify`, and `resolveMissing` decides once
 *     Google has been asked about that one event. A calendar that failed to
 *     load puts nothing in `verify`;
 *   - an event the user deleted here (the job's ignore list) stays deleted;
 *   - an event longer than the 24-hour shift limit is reported, not created.
 *
 * Refusals by the database (caps, overlaps) happen when the plan is applied.
 */
export type SyncJob = { id: string; name: string; keyword: string | null; calendarId: string | null; sync: boolean; ignored: string[] };
/** `adopted`: a hand-typed shift that sync linked to an event. It is never deleted by sync, only unlinked. */
export type LinkedShift = { id: string; jobId: string; startsAt: string; endsAt: string; calendarId: string | null; eventId: string | null; adopted: boolean };
export type SyncIssue = { jobName: string; startsAt: string; endsAt: string; reason: string };
export type PendingCheck = { shiftId: string; calendarId: string; eventId: string; jobId: string; adopted: boolean; startsAt: string; endsAt: string };
export type SyncPlan = {
  create: { jobId: string; startsAt: string; endsAt: string; calendarId: string; eventId: string }[];
  adopt: { shiftId: string; calendarId: string; eventId: string; jobId: string; startsAt: string; endsAt: string }[];
  relink: { shiftId: string; calendarId: string; eventId: string; jobId: string; startsAt: string; endsAt: string }[];
  update: { shiftId: string; jobId: string; startsAt: string; endsAt: string }[];
  verify: PendingCheck[];
  issues: SyncIssue[];
};
export type MissingResolution = { action: "delete" } | { action: "detach" } | { action: "keep" } | { action: "update"; jobId: string; startsAt: string; endsAt: string };

const DAY_MS = 24 * 60 * 60_000;
const keywordOf = (job: SyncJob) => (job.keyword ?? job.name).trim();
const isIgnored = (job: SyncJob, eventId: string) => job.ignored.some((key) => key.endsWith(`:${eventId}`));
const sameInstant = (a: string, b: string) => Date.parse(a) === Date.parse(b);

/** The job an event belongs to: its keyword as whole words in the title, from an allowed calendar; the longest keyword wins, ties by name. */
export function jobForEvent(event: CalendarEvent, jobs: SyncJob[], selectedCalendarIds: string[]): SyncJob | null {
  if (event.allDay || event.declined) return null;
  return jobs
    .filter((job) => titleHasKeyword(event.title, keywordOf(job)))
    .filter((job) => (job.calendarId ? event.calendarId === job.calendarId : selectedCalendarIds.includes(event.calendarId)))
    .sort((a, b) => keywordOf(b).length - keywordOf(a).length || a.name.localeCompare(b.name))[0] ?? null;
}

export function planShiftSync({ events, jobs, shifts, selectedCalendarIds, failedCalendarIds, now }: { events: CalendarEvent[]; jobs: SyncJob[]; shifts: LinkedShift[]; selectedCalendarIds: string[]; failedCalendarIds: string[]; now: Date }): SyncPlan {
  const syncJobs = jobs.filter((job) => job.sync);
  const syncJobIds = new Set(syncJobs.map((job) => job.id));
  const started = (shift: { startsAt: string }) => Date.parse(shift.startsAt) <= now.getTime();
  const plan: SyncPlan = { create: [], adopt: [], relink: [], update: [], verify: [], issues: [] };

  // One copy per event: an invite sits on several calendars under one id, so
  // take the first copy that belongs to a job -- which is the copy on the job's
  // own calendar when the job is restricted to one.
  const chosen = new Map<string, { event: CalendarEvent; job: SyncJob }>();
  for (const event of [...events].sort((a, b) => a.startsAt.localeCompare(b.startsAt))) {
    if (chosen.has(event.id)) continue;
    const job = jobForEvent(event, syncJobs, selectedCalendarIds);
    if (job && !isIgnored(job, event.id)) chosen.set(event.id, { event, job });
  }

  const linkedByEvent = new Map(shifts.filter((shift) => shift.eventId).map((shift) => [shift.eventId!, shift]));
  const orphans = shifts.filter((shift) => shift.eventId && shift.calendarId && !chosen.has(shift.eventId) && syncJobIds.has(shift.jobId) && !started(shift) && !failedCalendarIds.includes(shift.calendarId));
  const adopted = new Set<string>();

  for (const { event, job } of chosen.values()) {
    if (Date.parse(event.endsAt) - Date.parse(event.startsAt) > DAY_MS) {
      plan.issues.push({ jobName: job.name, startsAt: event.startsAt, endsAt: event.endsAt, reason: "longer than 24 hours" });
      continue;
    }
    const existing = linkedByEvent.get(event.id);
    if (existing) {
      const changed = !sameInstant(existing.startsAt, event.startsAt) || !sameInstant(existing.endsAt, event.endsAt) || existing.jobId !== job.id;
      if (changed && !started(existing)) plan.update.push({ shiftId: existing.id, jobId: job.id, startsAt: event.startsAt, endsAt: event.endsAt });
      continue;
    }
    const twin = { jobName: "", startsAt: event.startsAt, endsAt: event.endsAt };
    const orphanIndex = orphans.findIndex((orphan) => orphan.jobId === job.id && isSameShift(event, { ...twin, startsAt: orphan.startsAt, endsAt: orphan.endsAt }));
    if (orphanIndex !== -1) {
      const [orphan] = orphans.splice(orphanIndex, 1);
      plan.relink.push({ shiftId: orphan.id, calendarId: event.calendarId, eventId: event.id, jobId: job.id, startsAt: event.startsAt, endsAt: event.endsAt });
      continue;
    }
    const handTyped = shifts.find((shift) => !shift.eventId && shift.jobId === job.id && !adopted.has(shift.id) && isSameShift(event, { jobName: "", startsAt: shift.startsAt, endsAt: shift.endsAt }));
    if (handTyped) {
      adopted.add(handTyped.id);
      plan.adopt.push({ shiftId: handTyped.id, calendarId: event.calendarId, eventId: event.id, jobId: job.id, startsAt: handTyped.startsAt, endsAt: handTyped.endsAt });
    } else {
      plan.create.push({ jobId: job.id, startsAt: event.startsAt, endsAt: event.endsAt, calendarId: event.calendarId, eventId: event.id });
    }
  }

  plan.verify = orphans.map((shift) => ({ shiftId: shift.id, calendarId: shift.calendarId!, eventId: shift.eventId!, jobId: shift.jobId, adopted: shift.adopted, startsAt: shift.startsAt, endsAt: shift.endsAt }));
  return plan;
}

/**
 * An upcoming synced shift whose event was missing from the fetch, once Google
 * has answered for that one event. Gone (deleted, cancelled, declined) removes
 * the shift -- or only unlinks it when the user typed it in themselves. Alive
 * and still this job's: follow it wherever it moved. Alive but no longer the
 * job's (keyword edited, calendar unticked): keep the shift, stop following.
 */
export function resolveMissing(pending: PendingCheck, event: CalendarEvent | "gone", jobs: SyncJob[], selectedCalendarIds: string[]): MissingResolution {
  if (event === "gone" || event.declined) return pending.adopted ? { action: "detach" } : { action: "delete" };
  const job = jobForEvent(event, jobs.filter((candidate) => candidate.sync), selectedCalendarIds);
  if (!job) return { action: "detach" };
  if (Date.parse(event.endsAt) - Date.parse(event.startsAt) > DAY_MS) return { action: "detach" };
  const changed = !sameInstant(pending.startsAt, event.startsAt) || !sameInstant(pending.endsAt, event.endsAt) || pending.jobId !== job.id;
  return changed ? { action: "update", jobId: job.id, startsAt: event.startsAt, endsAt: event.endsAt } : { action: "keep" };
}
