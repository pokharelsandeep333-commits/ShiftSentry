"use client";

import { useState, type CSSProperties } from "react";
import { Ban, CircleCheck, RotateCcw, TriangleAlert } from "lucide-react";
import { formatCents } from "@/lib/earnings";
import { cn, formatMinutes } from "@/lib/utils";
import { EXAMPLE_WEEK, earnedSoFar, jobMinutes, tryShift, weekTotals, type ExampleShift } from "@/lib/welcome-week";

/**
 * The landing page's demonstration: the example week against its limit, and
 * one shift the visitor can try to add. The bar's scale runs past the limit
 * (to 22h) so a refused shift can be seen crossing the line rather than being
 * clipped at it.
 */
const SCALE_MINUTES = 1_320;
const ATTEMPT_DAY = "Sat";
const ATTEMPT_JOB = "cafe";
const ATTEMPTS = [300, 240] as const;

type Attempt = (typeof ATTEMPTS)[number] | null;

const week = EXAMPLE_WEEK;
const totals = weekTotals(week);
const earned = earnedSoFar(week);
const jobById = new Map(week.jobs.map((job) => [job.id, job]));

export function WeekGauge() {
  const [attempt, setAttempt] = useState<Attempt>(null);
  const result = attempt === null ? null : tryShift(week, { jobId: ATTEMPT_JOB, minutes: attempt });
  const shownTotal = result?.totalMinutes ?? totals.totalMinutes;
  const shifts: (ExampleShift & { attempt?: boolean })[] = attempt === null ? week.shifts : [...week.shifts, { jobId: ATTEMPT_JOB, day: ATTEMPT_DAY, minutes: attempt, planned: true, attempt: true }];

  return <figure aria-labelledby="example-week-title" className="relative rounded-[1.75rem] border border-white/40 bg-[var(--card)] p-4 text-[var(--foreground)] shadow-[0_30px_70px_-30px_rgb(20_13_91/0.55)] sm:p-7">
    <div className="flex items-start justify-between gap-4">
      <div>
        <p id="example-week-title" className="font-display text-lg font-semibold">This week</p>
        <p className="mt-0.5 text-xs text-[var(--muted-foreground)]">Example week · Mon to Sun</p>
      </div>
      <p className="shrink-0 whitespace-nowrap text-right font-display tabular-nums leading-none" aria-label={`${formatMinutes(shownTotal)} of ${formatMinutes(week.limitMinutes)}`}>
        <span className={cn("text-[2.5rem] font-semibold transition-colors duration-300 sm:text-5xl", result?.status === "refused" && "text-[var(--danger)]", result?.status === "saved" && "text-[var(--success)]")}>{formatMinutes(shownTotal)}</span>
        <span className="ml-1 text-base text-[var(--muted-foreground)] sm:text-lg">/ {formatMinutes(week.limitMinutes)}</span>
      </p>
    </div>

    <div className="relative mt-8 pb-7 pt-7" aria-hidden="true">
      <Marker at={week.limitMinutes} label={`${formatMinutes(week.limitMinutes)} limit`} className="border-l-2 border-[var(--foreground)]" labelClassName="top-0 font-semibold text-[var(--foreground)]" />
      <Marker at={(week.limitMinutes * week.alertPercent) / 100} label={`${week.alertPercent}%`} className="border-l-2 border-dashed border-[var(--warning)]" labelClassName="bottom-0 text-[var(--warning)]" />
      <div className="flex h-14 overflow-hidden rounded-2xl bg-[var(--surface-subtle)] sm:h-16">
        {shifts.map((shift, index) => <Segment key={`${shift.day}-${shift.jobId}-${shift.minutes}`} shift={shift} index={index} refused={shift.attempt === true && result?.status === "refused"} />)}
      </div>
    </div>

    <ul className="mt-1 flex flex-wrap gap-x-5 gap-y-1 text-xs text-[var(--muted-foreground)]" aria-label="Legend">
      <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm bg-[var(--muted-foreground)]" />Worked</li>
      <li className="flex items-center gap-1.5"><span className="size-2.5 rounded-sm border-2 border-dashed border-[var(--muted-foreground)]" />Planned</li>
    </ul>

    <ul className="mt-5 space-y-3">
      {week.jobs.map((job) => {
        // A refused shift was never saved, so it adds nothing to its job.
        const minutes = jobMinutes(week, job.id) + (attempt !== null && result?.status === "saved" && job.id === ATTEMPT_JOB ? attempt : 0);
        return <li key={job.id} className="grid grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1.5 text-sm">
          <span className="flex items-center gap-2 font-medium"><span className="size-2.5 rounded-full" style={{ backgroundColor: job.color }} />{job.name}</span>
          <span className="tabular-nums text-[var(--muted-foreground)]">{job.limitMinutes === null ? `${formatMinutes(minutes)} · no job limit` : `${formatMinutes(minutes)} of ${formatMinutes(job.limitMinutes)}`}</span>
          {job.limitMinutes !== null && <span className="col-span-2 h-1.5 overflow-hidden rounded-full bg-[var(--surface-subtle)]"><span className="block h-full rounded-full transition-[width] duration-500 ease-out" style={{ width: `${Math.min(100, (minutes / job.limitMinutes) * 100)}%`, backgroundColor: job.color }} /></span>}
        </li>;
      })}
    </ul>

    <p role="status" className={cn(
      "mt-5 flex items-start gap-2.5 rounded-2xl px-3.5 py-3 text-sm font-medium leading-6",
      result === null && "bg-[color-mix(in_srgb,var(--warning)_13%,transparent)] text-[color-mix(in_srgb,var(--warning)_62%,var(--foreground))]",
      result?.status === "refused" && "bg-[color-mix(in_srgb,var(--danger)_11%,transparent)] text-[color-mix(in_srgb,var(--danger)_70%,var(--foreground))]",
      result?.status === "saved" && "bg-[color-mix(in_srgb,var(--success)_12%,transparent)] text-[color-mix(in_srgb,var(--success)_55%,var(--foreground))]",
    )}>
      {result === null && <><TriangleAlert className="mt-1 size-4 shrink-0" />Planned hours put you at {totals.percent}% of your {formatMinutes(week.limitMinutes)} week.</>}
      {result?.status === "refused" && <><Ban className="mt-1 size-4 shrink-0" />Refused. That makes {formatMinutes(result.totalMinutes)}, {formatMinutes(result.overByMinutes)} over your {formatMinutes(week.limitMinutes)} limit.</>}
      {result?.status === "saved" && <><CircleCheck className="mt-1 size-4 shrink-0" />Saved. Exactly {formatMinutes(result.totalMinutes)} of {formatMinutes(week.limitMinutes)}.</>}
    </p>

    <div className="mt-5 border-t pt-5">
      <p className="text-sm font-medium">Try adding Saturday at River café</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {ATTEMPTS.map((minutes) => <button key={minutes} type="button" aria-pressed={attempt === minutes} onClick={() => setAttempt(attempt === minutes ? null : minutes)} className={cn(
          "h-11 rounded-xl border px-4 text-sm font-semibold transition-[background-color,border-color,color,transform] duration-200 ease-out focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--primary-soft)] active:translate-y-px",
          attempt === minutes ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]" : "bg-[var(--card)] hover:border-[color-mix(in_srgb,var(--primary)_40%,var(--border))] hover:bg-[var(--primary-soft)]",
        )}>{formatMinutes(minutes)} shift</button>)}
        {attempt !== null && <button type="button" onClick={() => setAttempt(null)} className="inline-flex h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-medium text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--primary-soft)]"><RotateCcw className="size-3.5" />Reset</button>}
      </div>
    </div>

    <figcaption className="mt-5 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t pt-5">
      <span className="text-sm text-[var(--muted-foreground)]">Earned so far, after tax</span>
      <span className="font-display text-2xl font-semibold tabular-nums">{formatCents(earned.netCents)}</span>
      <span className="w-full text-xs leading-5 text-[var(--muted-foreground)]">{formatCents(earned.grossCents)} before tax. Planned shifts count toward your hours, not your pay, until you work them.</span>
    </figcaption>
  </figure>;
}

function Segment({ shift, index, refused }: { shift: ExampleShift & { attempt?: boolean }; index: number; refused: boolean }) {
  const color = refused ? "var(--danger)" : (jobById.get(shift.jobId)?.color ?? "var(--primary)");
  const style: CSSProperties = { width: `${(shift.minutes / SCALE_MINUTES) * 100}%`, animationDelay: shift.attempt ? "0ms" : `${index * 110}ms` };
  if (shift.planned && !refused) Object.assign(style, { borderColor: color, backgroundColor: `color-mix(in srgb, ${color} 22%, transparent)` });
  else Object.assign(style, { backgroundColor: color });

  return <span className={cn(
    "gauge-seg flex h-full shrink-0 items-center overflow-hidden px-2 text-[11px] font-semibold",
    shift.planned && !refused ? "rounded-xl border-2 border-dashed text-[var(--foreground)]" : "shadow-[inset_-2px_0_0_var(--card)] text-white",
    refused && "rounded-r-xl",
  )} style={style}>
    <span className="hidden truncate sm:inline">{shift.day} · {formatMinutes(shift.minutes)}</span>
  </span>;
}

function Marker({ at, label, className, labelClassName }: { at: number; label: string; className: string; labelClassName: string }) {
  return <span className={cn("pointer-events-none absolute inset-y-0 z-10", className)} style={{ left: `${(at / SCALE_MINUTES) * 100}%` }}>
    <span className={cn("absolute -translate-x-1/2 whitespace-nowrap text-[11px]", labelClassName)}>{label}</span>
  </span>;
}
