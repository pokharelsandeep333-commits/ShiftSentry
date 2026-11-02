"use client";

import { useId, useState, type CSSProperties } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import type { WorkDay } from "@/lib/dashboard-insights";
import { formatCents } from "@/lib/earnings";
import type { DashboardData, JobSummary } from "@/lib/types";
import { buildJobLimitRows } from "@/lib/week-meter";
import { cn, formatMinutes } from "@/lib/utils";
import { TONE_TEXT } from "./week-card";
import styles from "./dashboard.module.css";

/** Seven columns have to fit a phone, where "12h 30m" does not; the button's
 *  label still carries the exact figure. */
function compactHours(minutes: number) {
  if (minutes < 60) return `${minutes}m`;
  return minutes % 60 === 0 ? `${minutes / 60}h` : `${(minutes / 60).toFixed(1)}h`;
}

/** "2h 30m", but "30m" rather than "0h 30m" and "3h" rather than "3h 0m". */
function shortHours(minutes: number) {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}m`;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/**
 * Each shift as a piece of the day's column, earliest at the bottom. Worked
 * time is solid and planned time is an outline, the same split the totals use:
 * a shift under way is worked up to now.
 */
function daySegments(day: WorkDay, now: number) {
  return day.shifts.flatMap((shift) => {
    const start = Date.parse(shift.startsAt);
    const end = Date.parse(shift.endsAt);
    const done = end <= now ? 1 : start >= now ? 0 : (now - start) / (end - start);
    const worked = Math.round(shift.minutes * done);
    return [
      { key: `${shift.id}-worked`, color: shift.jobColor, minutes: worked, planned: false },
      { key: `${shift.id}-planned`, color: shift.jobColor, minutes: shift.minutes - worked, planned: true },
    ].filter((segment) => segment.minutes > 0);
  });
}

type WeekPanelProps = {
  days: WorkDay[];
  jobs: JobSummary[];
  timeZone: string;
  snapshotAt: string;
  rangeLabel: string;
  earnedNetCents: number;
  forecast: DashboardData["weekForecast"];
};

/**
 * The week in one panel: what it pays, each day as a column in its jobs'
 * colours, the chosen day's shifts, and the jobs that carry their own limit.
 * The overall cap and its bar live in the card above, so nothing here repeats
 * them.
 */
export function WeekPanel({ days, jobs, timeZone, snapshotAt, rangeLabel, earnedNetCents, forecast }: WeekPanelProps) {
  const detailId = useId();
  const initial = days.find((day) => day.isToday) ?? days[0];
  const [selectedDate, setSelectedDate] = useState(initial?.date);
  const selected = days.find((day) => day.date === selectedDate) ?? initial;
  const now = Date.parse(snapshotAt);
  // An eight-hour day fills the column unless a longer one sets the scale.
  const scale = Math.max(8 * 60, ...days.map((day) => day.workedMinutes + day.scheduledMinutes));
  const projected = earnedNetCents + forecast.remainingNetCents;
  if (!selected) return null;

  const selectedTotal = selected.workedMinutes + selected.scheduledMinutes;

  return <section aria-labelledby="week-panel-title" className={cn("premium-card border", styles.weekPanel)}>
    <div className={styles.weekHead}>
      <div className="min-w-0">
        <h2 id="week-panel-title" className="font-display text-lg font-semibold">This week</h2>
        <p className="mt-0.5 text-sm text-[var(--muted-foreground)]">{rangeLabel}</p>
      </div>
      <div className={styles.weekPay}>
        <p><span className={styles.weekEarned}>{formatCents(earnedNetCents)}</span> <span className="text-sm text-[var(--muted-foreground)]">earned</span></p>
        <p className="text-sm text-[var(--muted-foreground)]" title={forecast.remainingShiftCount > 0 ? `${formatCents(forecast.remainingNetCents)} from ${forecast.remainingShiftCount} planned shift${forecast.remainingShiftCount === 1 ? "" : "s"}, after tax and deductions` : "After tax and deductions"}><span className={styles.weekProjected}>{formatCents(projected)}</span> by the end of the week</p>
      </div>
    </div>

    <div className={styles.ribbon} role="group" aria-label="Days this week">
      {days.map((day) => {
        const total = day.workedMinutes + day.scheduledMinutes;
        return <button key={day.date} type="button" aria-pressed={day.date === selected.date} aria-controls={detailId} aria-label={`${day.weekday} ${day.dayNumber}${day.isToday ? ", today" : ""}: ${total > 0 ? `${formatMinutes(day.workedMinutes)} worked, ${formatMinutes(day.scheduledMinutes)} planned` : "nothing scheduled"}`} onClick={() => setSelectedDate(day.date)} className={cn(styles.day, day.date === selected.date && styles.daySelected, day.isToday && styles.dayToday)}>
          <span className={styles.plot} aria-hidden="true">
            {daySegments(day, now).map((segment) => <span key={segment.key} className={cn(styles.segment, segment.planned && styles.segmentPlanned)} style={{ "--seg": segment.color, height: `${(segment.minutes / scale) * 100}%` } as CSSProperties} />)}
            {total > 0 && <span className={styles.dayHours}><span className="sm:hidden">{compactHours(total)}</span><span className="hidden sm:inline">{shortHours(total)}</span></span>}
          </span>
          <span className={styles.dayName}>{day.weekday}</span>
          <span className={styles.dayNumber}>{day.dayNumber}</span>
        </button>;
      })}
    </div>
    <p className={styles.legend} aria-hidden="true"><span><i className={styles.legendWorked} />Worked</span><span><i className={styles.legendPlanned} />Planned</span></p>

    <div id={detailId} className={styles.dayDetail} aria-live="polite" aria-atomic="true">
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <p className="text-sm font-semibold">{selected.isToday ? "Today" : formatInTimeZone(`${selected.date}T12:00:00Z`, "UTC", "EEEE, MMM d")}</p>
        {selected.shifts.length === 0 && <p className="text-sm text-[var(--muted-foreground)]">No shifts</p>}
        {selected.shifts.length > 1 && <p className="text-sm font-semibold tabular-nums">{shortHours(selectedTotal)}</p>}
      </div>
      {selected.shifts.length > 0 && <ul>
        {selected.shifts.map((shift) => <li key={shift.id}>
          <Link href={`/shifts/${shift.id}/edit`} className={styles.dayShift}>
            <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: shift.jobColor }} />
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium" title={shift.jobName}>{shift.jobName}</span>
              <span className="block text-xs tabular-nums text-[var(--muted-foreground)]">{formatInTimeZone(shift.startsAt, timeZone, "h:mm a")} – {formatInTimeZone(shift.endsAt, timeZone, "h:mm a")}{formatInTimeZone(shift.startsAt, timeZone, "yyyy-MM-dd") !== formatInTimeZone(shift.endsAt, timeZone, "yyyy-MM-dd") ? " · overnight" : ""}</span>
            </span>
            <span className="text-sm tabular-nums text-[var(--muted-foreground)]">{shortHours(shift.minutes)}</span>
          </Link>
        </li>)}
      </ul>}
    </div>

    <JobLimits jobs={jobs} />
  </section>;
}

/** Jobs with a limit of their own, as one quiet line of chips. A job nearing
 *  or past its limit takes the warning tone; the rest stay neutral. */
function JobLimits({ jobs }: { jobs: JobSummary[] }) {
  const rows = buildJobLimitRows(jobs.map((job) => ({ ...job, limitMinutes: job.weeklyLimitMinutes }))).filter((row) => row.limitMinutes !== null);
  if (rows.length === 0) return null;
  const warned = rows.some((row) => row.tone !== "calm");
  return <div className={styles.limits}>
    <ul aria-label="Job limits this week" className="flex flex-wrap gap-2">
      {rows.map((row) => <li key={row.id} className={cn(styles.limitChip, row.tone !== "calm" && styles[`limitChip_${row.tone}`])}>
        {row.tone === "calm" ? <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: row.color }} /> : <AlertTriangle aria-hidden="true" className={cn("size-3.5 shrink-0", TONE_TEXT[row.tone])} />}
        <span className="max-w-40 truncate" title={row.name}>{row.name}</span>
        <span className="tabular-nums"><span className={cn("font-semibold", TONE_TEXT[row.tone])}>{formatMinutes(row.plannedMinutes)}</span><span className="text-[var(--muted-foreground)]"> / {formatMinutes(row.limitMinutes ?? 0)}</span></span>
      </li>)}
    </ul>
    {warned && <Link href="/jobs" className="inline-flex min-h-11 items-center text-xs font-semibold text-[var(--primary)] underline-offset-4 hover:underline sm:min-h-8">Review limits</Link>}
  </div>;
}
