import Link from "next/link";
import { limitPosition, type JobLimitRow, type WeekMeter } from "@/lib/week-meter";
import { cn, formatMinutes } from "@/lib/utils";

// Text tones mixed toward the ink, as in the header meter: the raw amber and
// coral fill colours are too pale as small text on white.
const TONE = { calm: "text-[var(--foreground)]", warning: "text-[color-mix(in_srgb,var(--warning)_60%,var(--foreground))]", danger: "text-[color-mix(in_srgb,var(--danger)_70%,var(--foreground))]" } as const;

function note(planned: number, limit: number | null) {
  if (limit === null) return "No limit";
  const over = planned - limit;
  return over > 0 ? `${formatMinutes(over)} over` : `${formatMinutes(-over)} left`;
}

function Bar({ children, tick }: { children: React.ReactNode; tick: number | null }) {
  return <span aria-hidden="true" className="relative flex h-2 w-full gap-0.5 rounded-full bg-[color-mix(in_srgb,var(--foreground)_8%,transparent)]">
    {children}
    {tick !== null && tick < 100 && <span className="absolute -inset-y-1 w-0.5 -translate-x-1/2 rounded-full bg-[var(--foreground)]" style={{ left: `${tick}%` }} />}
  </span>;
}

/**
 * This week against your limits, at the top of the current week in the log:
 * the overall limit (Settings) and each job's own (Jobs). Job colours stay
 * solid for worked and planned time, as in the header meter. A guide, not
 * the rule: the database decides whether a shift fits when it is saved.
 */
export function WeekLimits({ meter, jobs }: { meter: WeekMeter; jobs: JobLimitRow[] }) {
  const tick = limitPosition(meter);
  const withLimit = jobs.filter((job) => job.limitMinutes !== null);

  return <section aria-label="This week against your limits" className="grid gap-4 rounded-2xl border bg-[var(--card)]/70 p-4">
    <div className="grid gap-2">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-sm font-semibold">All jobs</p>
        <p className="text-sm tabular-nums">
          <span className={cn("font-display font-semibold", TONE[meter.tone])}>{formatMinutes(meter.plannedMinutes)}</span>
          {meter.limitMinutes !== null && <span className="text-[var(--muted-foreground)]"> of {formatMinutes(meter.limitMinutes)}</span>}
          <span className={cn("ml-2 text-xs font-medium", meter.tone === "calm" ? "text-[var(--muted-foreground)]" : TONE[meter.tone])}>{note(meter.plannedMinutes, meter.limitMinutes)}</span>
        </p>
      </div>
      <Bar tick={tick}>
        {meter.segments.map((segment) => <span key={`${segment.jobId}-${segment.scheduled}`} className="h-full rounded-full" style={{ width: `${segment.widthPercent}%`, background: segment.color }} />)}
      </Bar>
      <p className="text-xs text-[var(--muted-foreground)]">
        {formatMinutes(meter.loggedMinutes)} worked · {formatMinutes(meter.plannedMinutes - meter.loggedMinutes)} still scheduled
        {meter.limitMinutes === null && <> · <Link href="/settings#week" className="font-semibold text-[var(--primary)] underline-offset-4 hover:underline">Set a weekly limit</Link></>}
      </p>
    </div>

    {withLimit.length > 0 && <ul className="grid gap-3 border-t pt-4 sm:grid-cols-2">
      {withLimit.map((job) => <li key={job.id} className="grid min-w-0 gap-1.5">
        <div className="flex min-w-0 items-baseline justify-between gap-3 text-sm">
          <span className="flex min-w-0 items-center gap-2"><span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ background: job.color }} /><span className="truncate font-medium">{job.name}</span></span>
          <span className="shrink-0 tabular-nums">
            <span className={cn("font-semibold", TONE[job.tone])}>{formatMinutes(job.plannedMinutes)}</span>
            <span className="text-[var(--muted-foreground)]"> / {formatMinutes(job.limitMinutes ?? 0)}</span>
          </span>
        </div>
        <Bar tick={job.limitMinutes && job.plannedMinutes > job.limitMinutes ? (job.limitMinutes / job.plannedMinutes) * 100 : null}>
          {job.loggedWidth > 0 && <span className="h-full rounded-full" style={{ width: `${job.loggedWidth}%`, background: job.color }} />}
          {job.scheduledWidth > 0 && <span className="h-full rounded-full" style={{ width: `${job.scheduledWidth}%`, background: job.color }} />}
        </Bar>
        <span className="sr-only">{job.name}: {formatMinutes(job.plannedMinutes)} of {formatMinutes(job.limitMinutes ?? 0)} this week, {note(job.plannedMinutes, job.limitMinutes)}.</span>
      </li>)}
    </ul>}
  </section>;
}
