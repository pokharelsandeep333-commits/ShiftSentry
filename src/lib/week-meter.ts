import { allocateShiftMinutes, percentage, weekStartFor } from "@/lib/time";

/**
 * The header's "this week" meter: the same planned total the dashboard's cap
 * card shows (logged plus scheduled, archived jobs excluded), drawn as one bar
 * with a segment per job. Pure so it can be tested; `getWeekMeter` in
 * `dashboard.ts` feeds it.
 */

export type WeekMeterJob = { id: string; name: string; color: string; usedMinutes: number; scheduledMinutes: number };

export type WeekMeterSegment = { jobId: string; name: string; color: string; minutes: number; scheduled: boolean; widthPercent: number };

export type WeekMeter = {
  plannedMinutes: number;
  loggedMinutes: number;
  limitMinutes: number | null;
  /** Of the limit, rounded the way the dashboard rounds it. 0 with no limit. */
  percent: number;
  /** The dashboard's ladder: amber from 80%, coral at the limit. */
  tone: "calm" | "warning" | "danger";
  /** Logged segments first, then scheduled, each in job order. */
  segments: WeekMeterSegment[];
};

export type WeekMeterShift = { jobId: string; startsAt: Date; endsAt: Date };

/**
 * Minutes per job inside the week that contains `now`, split at local
 * midnights so an overnight shift that crosses the week boundary counts only
 * its own side. A shift already started counts as logged, as on the dashboard.
 */
export function allocateWeekMinutes<J extends { id: string }>(jobs: J[], shifts: WeekMeterShift[], now: Date, timeZone: string, weekStartsOn: number): (J & { usedMinutes: number; scheduledMinutes: number })[] {
  const weekStart = weekStartFor(now, timeZone, weekStartsOn).getTime();
  const totals = jobs.map((job) => ({ ...job, usedMinutes: 0, scheduledMinutes: 0 }));
  const lookup = new Map(totals.map((job) => [job.id, job]));

  shifts.forEach((shift) => {
    const job = lookup.get(shift.jobId);
    if (!job) return;
    const scheduled = shift.startsAt > now;
    for (const allocation of allocateShiftMinutes(shift.startsAt, shift.endsAt, timeZone)) {
      if (weekStartFor(new Date(`${allocation.date}T12:00:00Z`), timeZone, weekStartsOn).getTime() !== weekStart) continue;
      if (scheduled) job.scheduledMinutes += allocation.minutes;
      else job.usedMinutes += allocation.minutes;
    }
  });
  return totals;
}

export function buildWeekMeter(jobs: WeekMeterJob[], limitMinutes: number | null): WeekMeter {
  const loggedMinutes = jobs.reduce((total, job) => total + job.usedMinutes, 0);
  const plannedMinutes = loggedMinutes + jobs.reduce((total, job) => total + job.scheduledMinutes, 0);
  const percent = percentage(plannedMinutes, limitMinutes);
  // The bar's full width is the limit, or the planned total once it is past
  // the limit, so an overrun still fits and the limit tick moves left of the end.
  const scale = Math.max(limitMinutes ?? 0, plannedMinutes);
  const width = (minutes: number) => (scale ? (minutes / scale) * 100 : 0);

  const segments: WeekMeterSegment[] = [
    ...jobs.filter((job) => job.usedMinutes > 0).map((job) => ({ jobId: job.id, name: job.name, color: job.color, minutes: job.usedMinutes, scheduled: false, widthPercent: width(job.usedMinutes) })),
    ...jobs.filter((job) => job.scheduledMinutes > 0).map((job) => ({ jobId: job.id, name: job.name, color: job.color, minutes: job.scheduledMinutes, scheduled: true, widthPercent: width(job.scheduledMinutes) })),
  ];

  return { plannedMinutes, loggedMinutes, limitMinutes, percent, tone: !limitMinutes ? "calm" : percent >= 100 ? "danger" : percent >= 80 ? "warning" : "calm", segments };
}

/** Where the limit falls on the bar, as a percentage of its width. */
export function limitPosition(meter: WeekMeter) {
  if (!meter.limitMinutes) return null;
  return (meter.limitMinutes / Math.max(meter.limitMinutes, meter.plannedMinutes)) * 100;
}
