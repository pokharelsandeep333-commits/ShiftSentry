import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { buildWeekMeter, limitPosition, type WeekMeter } from "@/lib/week-meter";
import { cn, formatMinutes, splitMinutes } from "@/lib/utils";
import type { JobSummary } from "@/lib/types";
import styles from "./dashboard.module.css";

// Text tones mixed toward the ink, as in the header meter and the shift log:
// the raw amber and coral fills are too pale as text on the violet wash.
export const TONE_TEXT = {
  calm: "text-[var(--foreground)]",
  warning: "text-[color-mix(in_srgb,var(--warning)_60%,var(--foreground))]",
  danger: "text-[color-mix(in_srgb,var(--danger)_70%,var(--foreground))]",
} as const;

const TONE_PILL = {
  calm: "border-[color-mix(in_srgb,var(--success)_30%,var(--border))] bg-[color-mix(in_srgb,var(--success)_10%,var(--card))] text-[color-mix(in_srgb,var(--success)_62%,var(--foreground))]",
  warning: "border-[color-mix(in_srgb,var(--warning)_35%,var(--border))] bg-[color-mix(in_srgb,var(--warning)_12%,var(--card))] " + TONE_TEXT.warning,
  danger: "border-[color-mix(in_srgb,var(--danger)_35%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_10%,var(--card))] " + TONE_TEXT.danger,
} as const;

/** The overall limit, said once, where the eye lands first. */
function StatusPill({ meter }: { meter: WeekMeter }) {
  if (meter.limitMinutes === null) return <Link href="/settings#week" className="press inline-flex min-h-11 shrink-0 items-center rounded-full border border-dashed px-3.5 text-xs font-semibold text-[var(--primary)] hover:bg-[var(--primary-soft)] sm:min-h-9">Set a weekly limit</Link>;
  return <span className={cn("inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold tabular-nums", TONE_PILL[meter.tone])}>
    {meter.tone !== "calm" && <AlertTriangle aria-hidden="true" className="size-3.5" />}
    {meter.percent}% planned
  </span>;
}

/** The compact global cap summary; the days and job limits live in the week panel below it. */
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
        {meter.segments.map((segment) => <span key={`${segment.jobId}-${segment.scheduled}`} className="h-full rounded-full" style={{ width: `${segment.widthPercent}%`, background: segment.color }} />)}
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
