import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { buildJobLimitRows, buildWeekMeter, limitPosition, type JobLimitRow, type WeekMeter } from "@/lib/week-meter";
import { cn, formatMinutes, splitMinutes } from "@/lib/utils";
import type { JobSummary } from "@/lib/types";
import styles from "./dashboard.module.css";

// Text tones mixed toward the ink, as in the header meter and the shift log:
// the raw amber and coral fills are too pale as text on the violet wash.
const TONE_TEXT = {
  calm: "text-[var(--foreground)]",
  warning: "text-[color-mix(in_srgb,var(--warning)_60%,var(--foreground))]",
  danger: "text-[color-mix(in_srgb,var(--danger)_70%,var(--foreground))]",
} as const;

const TONE_PILL = {
  calm: "border-[color-mix(in_srgb,var(--success)_30%,var(--border))] bg-[color-mix(in_srgb,var(--success)_10%,var(--card))] text-[color-mix(in_srgb,var(--success)_62%,var(--foreground))]",
  warning: "border-[color-mix(in_srgb,var(--warning)_35%,var(--border))] bg-[color-mix(in_srgb,var(--warning)_12%,var(--card))] " + TONE_TEXT.warning,
  danger: "border-[color-mix(in_srgb,var(--danger)_35%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_10%,var(--card))] " + TONE_TEXT.danger,
} as const;

/** What is left before a limit, or how far past it. */
function headroom(planned: number, limit: number) {
  const over = planned - limit;
  if (over > 0) return `${formatMinutes(over)} over`;
  return over === 0 ? "At the limit" : `${formatMinutes(-over)} left`;
}

function faint(color: string) {
  return `color-mix(in srgb, ${color} 36%, transparent)`;
}

/** The overall limit, said once, where the eye lands first. */
function StatusPill({ meter }: { meter: WeekMeter }) {
  if (meter.limitMinutes === null) return <Link href="/settings#week" className="press inline-flex min-h-11 shrink-0 items-center rounded-full border border-dashed px-3.5 text-xs font-semibold text-[var(--primary)] hover:bg-[var(--primary-soft)] sm:min-h-9">Set a weekly limit</Link>;
  return <span className={cn("inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold tabular-nums", TONE_PILL[meter.tone])}>
    {meter.tone !== "calm" && <AlertTriangle aria-hidden="true" className="size-3.5" />}
    {meter.percent}% planned
  </span>;
}

function JobRow({ job }: { job: JobLimitRow }) {
  const limited = job.limitMinutes !== null;
  const tick = job.limitMinutes && job.plannedMinutes > job.limitMinutes ? (job.limitMinutes / job.plannedMinutes) * 100 : null;
  return <li className={cn("grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2", limited && "sm:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)_auto]")}>
    <span className="flex min-w-0 items-center gap-2.5 text-sm font-semibold">
      <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ background: job.color }} />
      <span className="min-w-0 break-words [overflow-wrap:anywhere]" title={job.name}>{job.name}</span>
    </span>
    {/* A job with no limit has nothing to fill toward, so it gets no bar. */}
    {limited
      ? <span aria-hidden="true" className="relative col-span-2 flex h-1.5 gap-0.5 rounded-full bg-[color-mix(in_srgb,var(--foreground)_7%,transparent)] max-sm:order-last sm:col-span-1">
          {job.loggedWidth > 0 && <span className="h-full rounded-full" style={{ width: `${job.loggedWidth}%`, background: job.color }} />}
          {job.scheduledWidth > 0 && <span className="h-full rounded-full" style={{ width: `${job.scheduledWidth}%`, background: faint(job.color) }} />}
          {tick !== null && <span className="absolute -inset-y-1 w-0.5 -translate-x-1/2 rounded-full bg-[var(--foreground)]" style={{ left: `${tick}%` }} />}
        </span>
      : null}
    <span className="whitespace-nowrap text-right text-sm tabular-nums">
      <span className={cn("inline-flex items-center gap-1 font-semibold", TONE_TEXT[job.tone])}>
        {job.tone !== "calm" && <AlertTriangle aria-hidden="true" className="size-3.5" />}
        {formatMinutes(job.plannedMinutes)}
      </span>
      <span className="text-[var(--muted-foreground)]">{limited ? ` / ${formatMinutes(job.limitMinutes ?? 0)}` : " · no limit"}</span>
    </span>
    <span className="sr-only">{job.name}: {formatMinutes(job.plannedMinutes)} this week{limited ? ` of a ${formatMinutes(job.limitMinutes ?? 0)} limit, ${headroom(job.plannedMinutes, job.limitMinutes ?? 0).toLowerCase()}` : ", no limit set"}.</span>
  </li>;
}

/** The compact global cap summary; detailed days and job limits live below it. */
export function WeekCard({ jobs, workedMinutes, limitMinutes, rangeLabel, upcomingCount }: { jobs: JobSummary[]; workedMinutes: number; limitMinutes: number | null; rangeLabel: string; upcomingCount: number }) {
  const meter = buildWeekMeter(jobs, limitMinutes);
  const planned = splitMinutes(meter.plannedMinutes);
  const scheduledMinutes = Math.max(0, meter.plannedMinutes - workedMinutes);
  const over = limitMinutes !== null && meter.plannedMinutes > limitMinutes;
  const tick = limitPosition(meter);
  const width = limitMinutes === null ? (meter.plannedMinutes > 0 ? 100 : 0) : Math.min(100, meter.percent);

  return <section aria-labelledby="week-card-title" className={cn("premium-card min-w-0", styles.cap)}>
    <div className="min-w-0">
      <div className={styles.capHeader}>
        <h2 id="week-card-title" className="font-display text-base font-semibold">Global weekly cap</h2>
        <StatusPill meter={meter} />
        <p className={cn(styles.capDescription, "text-sm text-[var(--muted-foreground)]")} title={rangeLabel}>Logged plus scheduled hours.</p>
      </div>
      <p className="mt-4 flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="font-display text-[2.5rem] font-semibold leading-none tracking-[-0.035em] normal-nums sm:text-6xl">{planned.hours}<span className="ml-0.5 text-2xl text-[var(--muted-foreground)] sm:text-3xl">h</span>{planned.minutes > 0 && <span className="ml-2 text-2xl text-[var(--muted-foreground)] sm:text-3xl">{planned.minutes}m</span>}</span>
        <span className="text-sm text-[var(--muted-foreground)]">{limitMinutes === null ? "planned · no cap set" : `of ${formatMinutes(limitMinutes)}`}</span>
      </p>
      <div className="relative mt-5 flex h-2.5 gap-0.5 overflow-hidden rounded-full bg-[color-mix(in_srgb,var(--foreground)_7%,transparent)] shadow-inner" role="progressbar" aria-label="Global weekly cap" aria-valuemin={0} aria-valuemax={100} aria-valuenow={width} aria-valuetext={`${formatMinutes(meter.plannedMinutes)} planned${limitMinutes === null ? ", no cap set" : ` of ${formatMinutes(limitMinutes)}`}`}>
        {meter.segments.map((segment) => <span key={`${segment.jobId}-${segment.scheduled}`} className="h-full rounded-full" style={{ width: `${segment.widthPercent}%`, background: segment.scheduled ? faint(segment.color) : segment.color }} />)}
        {tick !== null && tick < 100 && <span aria-hidden="true" className="absolute inset-y-0 w-0.5 bg-[var(--foreground)]" style={{ left: `${tick}%` }} />}
      </div>
      <div className="mt-3 flex flex-wrap justify-between gap-x-4 gap-y-1 text-xs tabular-nums text-[var(--muted-foreground)]"><span>{formatMinutes(workedMinutes)} logged</span><span>{formatMinutes(scheduledMinutes)} scheduled</span></div>
    </div>
    <dl className={styles.capFacts}>
      <div><dt>{over ? "Over limit" : "Remaining"}</dt><dd className={over ? TONE_TEXT.danger : undefined}>{limitMinutes === null ? "Not set" : formatMinutes(Math.abs(limitMinutes - meter.plannedMinutes))}</dd></div>
      <div><dt>Upcoming</dt><dd title="Upcoming shifts this week">{upcomingCount}</dd></div>
    </dl>
  </section>;
}

/** Job limits remain visible with the detailed work week, away from the global cap. */
export function WeekJobLimits({ jobs }: { jobs: JobSummary[] }) {
  const rows = buildJobLimitRows(jobs.map((job) => ({ ...job, limitMinutes: job.weeklyLimitMinutes })));
  const warnings = rows.filter((row) => row.tone !== "calm");
  if (rows.length === 0) return null;
  return <div className="mt-4 border-t pt-4">
    <h3 className="mb-3 text-xs font-semibold text-[var(--muted-foreground)]">Hours by job</h3>
    <ul aria-label="Each job this week" className="grid gap-3">{rows.map((row) => <JobRow key={row.id} job={row} />)}</ul>
    {warnings.length > 0 && <p className="mt-3 flex items-start gap-2 text-xs leading-5 text-[color-mix(in_srgb,var(--warning)_60%,var(--foreground))]"><AlertTriangle aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" /><span>{warnings.length === 1 ? `${warnings[0].name} is ${warnings[0].tone === "danger" ? "at or over" : "approaching"} its weekly limit.` : `${warnings.length} jobs are approaching or have reached their weekly limits.`} <Link href="/jobs" className="flex min-h-11 w-fit items-center font-semibold underline underline-offset-4 sm:inline sm:min-h-0">Review limits</Link></span></p>}
  </div>;
}
