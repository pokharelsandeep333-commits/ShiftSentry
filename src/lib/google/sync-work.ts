import { planShiftSync, resolveMissing, type LinkedShift, type MissingResolution, type PendingCheck, type SyncJob } from "@/lib/google-sync-plan";
import { getEvent, listEventsForSync } from "./client";
import { SyncBudget, SyncBudgetExceeded } from "./sync-budget";

/** Read and validate the whole plan before any shift write is allowed. */
export async function readSyncWork(token: string, selected: string[], jobs: SyncJob[], shifts: LinkedShift[], range: { timeMin: string; timeMax: string }, timeZone: string, now: Date, budget = new SyncBudget()) {
  const ids = budget.calendarIds([...selected, ...jobs.filter((job) => job.sync).flatMap((job) => job.calendarId ? [job.calendarId] : [])]);
  const fetched = await listEventsForSync(token, ids, range, timeZone, budget);
  const plan = planShiftSync({ events: fetched.events, jobs, shifts, selectedCalendarIds: selected, failedCalendarIds: fetched.failedCalendarIds, now });
  const resolved: { pending: PendingCheck; resolution: MissingResolution }[] = [];
  for (const pending of plan.verify) {
    try {
      const event = await getEvent(token, pending.calendarId, pending.eventId, timeZone, budget);
      resolved.push({ pending, resolution: resolveMissing(pending, event, jobs, selected) });
    } catch (error) {
      if (error instanceof SyncBudgetExceeded) throw error;
      resolved.push({ pending, resolution: { action: "keep" } });
    }
  }
  budget.checkWrites(plan.create.length + plan.adopt.length + plan.relink.length + plan.update.length + resolved.filter(({ resolution }) => resolution.action !== "keep").length);
  return { plan, resolved };
}
