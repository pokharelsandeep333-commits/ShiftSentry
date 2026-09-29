"use client";

import { useState, type CSSProperties } from "react";
import { Ban, CircleCheck, RotateCcw, TriangleAlert } from "lucide-react";
import { formatCents } from "@/lib/earnings";
import { cn, formatMinutes } from "@/lib/utils";
import { EXAMPLE_WEEK, earnedSoFar, jobMinutes, tryShift, weekTotals, type ExampleShift } from "@/lib/welcome-week";

/**
 * The landing page's demonstration: the example week against its limit, and
 * one Saturday shift the visitor can try to add. The bar's scale runs past the
 * limit (to 22h) so a refused shift can be seen crossing the line rather than
 * being clipped at it.
 *
 * The big total counts between values through the `--wk-total` integer
 * property in globals.css. That only works for whole hours, which every value
 * this example can reach is; the aria-label carries the real figure either way.
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
const attemptJob = jobById.get(ATTEMPT_JOB);

export function WeekGauge() {
  const [attempt, setAttempt] = useState<Attempt>(null);
  const result = attempt === null ? null : tryShift(week, { jobId: ATTEMPT_JOB, minutes: attempt });
  const shownTotal = result?.totalMinutes ?? totals.totalMinutes;
  const shifts: (ExampleShift & { attempt?: boolean })[] = attempt === null ? week.shifts : [...week.shifts, { jobId: ATTEMPT_JOB, day: ATTEMPT_DAY, minutes: attempt, planned: true, attempt: true }];

  return <figure aria-labelledby="example-week-title" className="wk-stage">
    <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
      <div className="min-w-0">
        <p id="example-week-title" className="text-sm font-medium text-[var(--muted-foreground)]">Example week, Mon to Sun</p>
        <p role="status" className={cn(
          "mt-2 flex items-start gap-2 text-[15px] font-medium leading-6 sm:text-base",
          result === null && "text-[color-mix(in_srgb,var(--warning)_70%,var(--foreground))]",
          result?.status === "refused" && "text-[color-mix(in_srgb,var(--danger)_78%,var(--foreground))]",
          result?.status === "saved" && "text-[color-mix(in_srgb,var(--success)_62%,var(--foreground))]",
        )}>
          {result === null && <><TriangleAlert className="mt-1 size-4 shrink-0" />Planned hours put you at {totals.percent}% of your {formatMinutes(week.limitMinutes)} week.</>}
          {result?.status === "refused" && <><Ban className="mt-1 size-4 shrink-0" />Refused. That makes {formatMinutes(result.totalMinutes)}, {formatMinutes(result.overByMinutes)} over your limit.</>}
          {result?.status === "saved" && <><CircleCheck className="wk-tick mt-1 size-4 shrink-0" />Saved. Exactly {formatMinutes(result.totalMinutes)} of {formatMinutes(week.limitMinutes)}.</>}
        </p>
      </div>
      <p className="shrink-0 font-display leading-none tabular-nums" aria-label={`${formatMinutes(shownTotal)} of ${formatMinutes(week.limitMinutes)}`}>
        <span aria-hidden="true" className={cn("wk-total text-5xl font-semibold transition-colors duration-300 sm:text-6xl", result?.status === "refused" && "text-[var(--danger)]", result?.status === "saved" && "text-[var(--success)]")} style={{ "--wk-total": Math.round(shownTotal / 60) } as CSSProperties} />
        <span aria-hidden="true" className="ml-2 text-lg text-[var(--muted-foreground)]">of {formatMinutes(week.limitMinutes)}</span>
      </p>
    </div>

    <div className="relative mt-8 pb-8 pt-8" aria-hidden="true">
      {/* Border colours carry `!`: the unlayered `* { border-color }` rule in
          globals.css otherwise beats every layered Tailwind border colour. */}
      <Marker at={week.limitMinutes} label={`${formatMinutes(week.limitMinutes)} limit`} className="border-l-2 border-[var(--foreground)]" labelClassName="-top-5 -translate-x-[85%] font-semibold text-[var(--foreground)] sm:-translate-x-1/2" />
      {/* Labels sit clear of their lines: the limit's above the top end, the warning's to its left. */}
      <Marker at={(week.limitMinutes * week.alertPercent) / 100} label={`${week.alertPercent}% warning`} className="border-l-2 border-dashed border-[var(--warning)]" labelClassName="bottom-0 right-1.5 translate-x-0 text-[color-mix(in_srgb,var(--warning)_75%,var(--foreground))]" />
      <div className="flex h-20 overflow-hidden rounded-[1.25rem] bg-[var(--surface-subtle)] sm:h-24">
        {shifts.map((shift, index) => <Segment key={`${shift.day}-${shift.jobId}-${shift.minutes}`} shift={shift} index={index} refused={shift.attempt === true && result?.status === "refused"} />)}
      </div>
    </div>

    <div className="mt-2 flex flex-wrap items-center gap-2">
      {ATTEMPTS.map((minutes) => <button key={minutes} type="button" aria-pressed={attempt === minutes} onClick={() => setAttempt(attempt === minutes ? null : minutes)} className={cn(
        "h-10 rounded-full border px-4 text-[13px] font-semibold transition-[background-color,border-color,color,transform] duration-200 ease-out focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--primary-soft)] active:translate-y-px",
        // Unpressed, the button is one of the page's white glass pills; the
        // glass class draws its own hover and focus ring (see globals.css).
        attempt === minutes ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]" : "welcome-ghost",
      )}>Add {formatMinutes(minutes)} Saturday</button>)}
      {attempt !== null && <button type="button" onClick={() => setAttempt(null)} className="inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--primary-soft)]"><RotateCcw className="size-3.5" />Reset</button>}
      <span className="text-[13px] text-[var(--muted-foreground)] sm:ml-2">at {attemptJob?.name}</span>
    </div>

    <dl className="mt-7 grid gap-5 border-t pt-7 sm:grid-cols-3 sm:gap-8">
      {week.jobs.map((job) => {
        // A refused shift was never saved, so it adds nothing to its job.
        const minutes = jobMinutes(week, job.id) + (attempt !== null && result?.status === "saved" && job.id === ATTEMPT_JOB ? attempt : 0);
        return <div key={job.id}>
          <dt className="flex items-center gap-2 text-sm font-medium"><span className="size-2.5 rounded-full" style={{ backgroundColor: job.color }} />{job.name}</dt>
          <dd className="mt-1.5 font-display text-xl font-semibold tabular-nums">{formatMinutes(minutes)}<span className="ml-1.5 font-sans text-sm font-normal text-[var(--muted-foreground)]">{job.limitMinutes === null ? "no job limit" : `of ${formatMinutes(job.limitMinutes)} job limit`}</span></dd>
        </div>;
      })}
      <div>
        <dt className="text-sm font-medium">Earned so far, after tax</dt>
        <dd className="mt-1.5 font-display text-xl font-semibold tabular-nums">{formatCents(earned.netCents)}<span className="ml-1.5 font-sans text-sm font-normal text-[var(--muted-foreground)]">of {formatCents(earned.grossCents)}</span></dd>
      </div>
    </dl>
    <figcaption className="mt-6 text-[13px] leading-6 text-[var(--muted-foreground)]">Dashed shifts are planned. They count toward your hours now, and toward your pay once you work them.</figcaption>
  </figure>;
}

function Segment({ shift, index, refused }: { shift: ExampleShift & { attempt?: boolean }; index: number; refused: boolean }) {
  const color = jobById.get(shift.jobId)?.color ?? "var(--primary)";
  const style: CSSProperties = { width: `${(shift.minutes / SCALE_MINUTES) * 100}%`, animationDelay: shift.attempt ? "0ms" : `${index * 110}ms` };
  if (refused) Object.assign(style, { color: "var(--danger)" });
  else if (shift.planned) Object.assign(style, { borderColor: color, backgroundColor: `color-mix(in srgb, ${color} 20%, transparent)` });
  else Object.assign(style, { backgroundColor: color });

  return <span className={cn(
    "gauge-seg flex h-full shrink-0 flex-col justify-center overflow-hidden px-2.5 leading-tight",
    refused ? "wk-refused rounded-r-2xl border-2 border-[var(--danger)]" : shift.planned ? "rounded-2xl border-2 border-dashed text-[var(--foreground)]" : "text-[#11121a] shadow-[inset_-2px_0_0_var(--card)]",
  )} style={style}>
    <span className="hidden truncate text-[11px] font-medium opacity-75 sm:block">{shift.day}</span>
    <span className="hidden truncate text-sm font-semibold sm:block">{formatMinutes(shift.minutes)}</span>
  </span>;
}

function Marker({ at, label, className, labelClassName }: { at: number; label: string; className: string; labelClassName: string }) {
  return <span className={cn("pointer-events-none absolute inset-y-0 z-10", className)} style={{ left: `${(at / SCALE_MINUTES) * 100}%` }}>
    <span className={cn("absolute -translate-x-1/2 whitespace-nowrap text-xs", labelClassName)}>{label}</span>
  </span>;
}
