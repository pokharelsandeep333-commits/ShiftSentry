"use client";

import { useState, type CSSProperties } from "react";
import { Ban, CircleCheck, RotateCcw, TriangleAlert } from "lucide-react";
import { formatCents } from "@/lib/earnings";
import { cn, formatMinutes } from "@/lib/utils";
import { EXAMPLE_WEEK, earnedSoFar, jobMinutes, roomLeft, tryShift, weekTotals, type ExampleShift } from "@/lib/welcome-week";

/**
 * The landing page's demonstration: the example week against its limit, and
 * three Saturday shifts the visitor can try to add. One passes the global
 * limit, one lands exactly on it, and one passes the Campus desk's own 12h
 * cap while the week still has room, so both checks the trigger makes are on
 * show. The bar's scale runs past the limit (to 22h) so a refused shift can be
 * seen crossing the line rather than being clipped at it.
 *
 * The big total is the week as stored: a refused shift never changes it, so a
 * refusal is shown as a "would be" line under it rather than as the headline.
 * The total counts between values through the `--wk-total` integer property in
 * globals.css, which only works for whole hours (every value here is); the
 * real figure is also in the text, for screen readers and anything that reads
 * the page without its CSS.
 */
const SCALE_MINUTES = 1_320;
const ATTEMPT_DAY = "Sat";
const ATTEMPTS = [
  { jobId: "cafe", minutes: 300, place: "café" },
  { jobId: "cafe", minutes: 240, place: "café" },
  { jobId: "campus", minutes: 120, place: "desk" },
] as const;

const week = EXAMPLE_WEEK;
const totals = weekTotals(week);
const earned = earnedSoFar(week);
const jobById = new Map(week.jobs.map((job) => [job.id, job]));

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)]";

export function WeekGauge() {
  const [pressed, setPressed] = useState<number | null>(null);
  const attempt = pressed === null ? null : ATTEMPTS[pressed];
  const result = attempt === null ? null : tryShift(week, attempt);
  const attemptJob = attempt === null ? undefined : jobById.get(attempt.jobId);
  const shownTotal = result?.status === "saved" ? result.totalMinutes : totals.totalMinutes;
  const shifts: (ExampleShift & { attempt?: boolean })[] = attempt === null ? week.shifts : [...week.shifts, { jobId: attempt.jobId, day: ATTEMPT_DAY, minutes: attempt.minutes, planned: true, attempt: true }];

  return <figure aria-labelledby="example-week-title" className="wk-stage">
    <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
      <div className="min-w-0">
        <p id="example-week-title" className="text-sm font-medium text-[var(--muted-foreground)]">Example week, Mon to Sun</p>
        <p role="status" className={cn(
          "mt-2 flex items-start gap-2 text-[15px] font-medium leading-6 sm:text-base",
          result === null && "text-[color-mix(in_srgb,var(--warning)_60%,var(--foreground))]",
          result?.status === "refused" && "text-[color-mix(in_srgb,var(--danger)_78%,var(--foreground))]",
          result?.status === "saved" && "text-[color-mix(in_srgb,var(--success)_62%,var(--foreground))]",
        )}>
          {result === null && <><TriangleAlert className="mt-1 size-4 shrink-0" />Planned hours put you at {totals.percent}% of your {formatMinutes(week.limitMinutes)} week.</>}
          {attempt !== null && result?.status === "refused" && <><Ban className="mt-1 size-4 shrink-0" /><span>{result.reason === "job" && attemptJob?.limitMinutes != null
            ? `Refused. ${attemptJob.name} would reach ${formatMinutes(jobMinutes(week, attempt.jobId) + attempt.minutes)}, ${formatMinutes(result.overByMinutes)} over its ${formatMinutes(attemptJob.limitMinutes)} job limit.`
            : `Refused. That makes ${formatMinutes(result.totalMinutes)}, ${formatMinutes(result.overByMinutes)} over your limit.`} {fitHint(roomLeft(week, attempt.jobId))}</span></>}
          {result?.status === "saved" && <><CircleCheck className="wk-tick mt-1 size-4 shrink-0" />{result.totalMinutes === week.limitMinutes
            ? `Saved. Exactly ${formatMinutes(result.totalMinutes)} of ${formatMinutes(week.limitMinutes)}, so this week is full.`
            : `Saved. That makes ${formatMinutes(result.totalMinutes)} of ${formatMinutes(week.limitMinutes)}.`}</>}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-display leading-none tabular-nums">
          <span className="sr-only">{formatMinutes(shownTotal)} of {formatMinutes(week.limitMinutes)}</span>
          <span aria-hidden="true" className={cn("wk-total text-5xl font-semibold transition-colors duration-300 sm:text-6xl", result?.status === "saved" && "text-[var(--success)]")} style={{ "--wk-total": Math.round(shownTotal / 60) } as CSSProperties} />
          <span aria-hidden="true" className="ml-2 text-lg text-[var(--muted-foreground)]">of {formatMinutes(week.limitMinutes)}</span>
        </p>
        {/* Visible only; the status line above already says this to screen readers. */}
        <p aria-hidden="true" className={cn("mt-2 h-5 text-sm font-medium tabular-nums text-[color-mix(in_srgb,var(--danger)_78%,var(--foreground))]", result?.status !== "refused" && "invisible")}>
          {result?.status === "refused" && (result.reason === "job" && attempt !== null
            ? `${attemptJob?.name} would be ${formatMinutes(jobMinutes(week, attempt.jobId) + attempt.minutes)}`
            : `would be ${formatMinutes(result.totalMinutes)}`)}
        </p>
      </div>
    </div>

    <div className="relative mt-6 pb-8 pt-8" aria-hidden="true">
      {/* Border colours carry `!`: the unlayered `* { border-color }` rule in
          globals.css otherwise beats every layered Tailwind border colour. */}
      <Marker at={week.limitMinutes} label={`${formatMinutes(week.limitMinutes)} limit`} className="border-l-2 border-[var(--foreground)]" labelClassName="-top-5 -translate-x-[85%] font-semibold text-[var(--foreground)] sm:-translate-x-1/2" />
      {/* Labels sit clear of their lines: the limit's above the top end, the warning's to its left. */}
      <Marker at={(week.limitMinutes * week.alertPercent) / 100} label={`${week.alertPercent}% warning`} className="border-l-2 border-dashed border-[var(--warning)]" labelClassName="bottom-0 right-1.5 translate-x-0 text-[color-mix(in_srgb,var(--warning)_60%,var(--foreground))]" />
      <div className="flex h-20 overflow-hidden rounded-[1.25rem] bg-[var(--surface-subtle)] sm:h-24">
        {shifts.map((shift, index) => <Segment key={`${shift.day}-${shift.jobId}-${shift.minutes}`} shift={shift} index={index} refused={shift.attempt === true && result?.status === "refused"} />)}
      </div>
    </div>

    <div role="group" aria-labelledby="example-week-try" className="mt-2 flex flex-wrap items-center gap-2">
      <span id="example-week-try" className="w-full text-[13px] text-[var(--muted-foreground)] sm:mr-1 sm:w-auto">Try adding a Saturday shift:</span>
      {ATTEMPTS.map(({ minutes, place }, index) => <button key={`${place}-${minutes}`} type="button" aria-pressed={pressed === index} onClick={() => setPressed(pressed === index ? null : index)} className={cn(
        "min-h-11 rounded-full border px-4 text-[13px] font-semibold transition-[background-color,border-color,color,transform] duration-200 ease-out active:translate-y-px",
        focusRing,
        // Unpressed, the button is one of the page's white glass pills; the
        // glass class draws its own hover and focus outline (see globals.css).
        pressed === index ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)]" : "welcome-ghost",
      )}>{formatMinutes(minutes)} {place}</button>)}
      {/* Always rendered, so the row never reflows under the thumb when it appears. */}
      <button type="button" disabled={pressed === null} onClick={() => setPressed(null)} className={cn("inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]", focusRing, pressed === null && "invisible")}><RotateCcw className="size-3.5" />Reset</button>
    </div>

    <dl className="mt-7 grid gap-5 border-t pt-7 sm:grid-cols-3 sm:gap-8">
      {week.jobs.map((job) => {
        // A refused shift was never saved, so it adds nothing to its job.
        const minutes = jobMinutes(week, job.id) + (attempt !== null && result?.status === "saved" && job.id === attempt.jobId ? attempt.minutes : 0);
        return <div key={job.id}>
          <dt className="flex items-center gap-2 text-sm font-medium"><span className="size-2.5 rounded-full" style={{ backgroundColor: job.color }} />{job.name}</dt>
          <dd className="mt-1.5 font-display text-xl font-semibold tabular-nums">{formatMinutes(minutes)}<span className="ml-1.5 font-sans text-sm font-normal text-[var(--muted-foreground)]">{job.limitMinutes === null ? "no job limit" : `of ${formatMinutes(job.limitMinutes)} job limit`}</span></dd>
        </div>;
      })}
      <div>
        <dt className="text-sm font-medium">Earned so far, after tax</dt>
        <dd className="mt-1.5 font-display text-xl font-semibold tabular-nums">{formatCents(earned.netCents)}<span className="ml-1.5 font-sans text-sm font-normal text-[var(--muted-foreground)]">{formatCents(earned.grossCents)} before tax</span></dd>
      </div>
    </dl>
    <figcaption className="mt-6 text-[13px] leading-6 text-[var(--muted-foreground)]">Dashed shifts are planned. They count toward your hours now, and toward your pay once you work them.</figcaption>
  </figure>;
}

function fitHint(room: number) {
  return room > 0 ? `${formatMinutes(room)} would fit.` : "Nothing more fits this week.";
}

function Segment({ shift, index, refused }: { shift: ExampleShift & { attempt?: boolean }; index: number; refused: boolean }) {
  const color = jobById.get(shift.jobId)?.color ?? "var(--primary)";
  const style: CSSProperties = { width: `${(shift.minutes / SCALE_MINUTES) * 100}%`, animationDelay: shift.attempt ? "0ms" : `${index * 110}ms` };
  if (refused) Object.assign(style, { color: "var(--danger)" });
  else if (shift.planned) Object.assign(style, { borderColor: color, backgroundColor: `color-mix(in srgb, ${color} 20%, transparent)` });
  else Object.assign(style, { backgroundColor: color });

  return <span className={cn(
    "gauge-seg flex h-full shrink-0 flex-col justify-center overflow-hidden px-1.5 leading-tight sm:px-2.5",
    refused ? "wk-refused rounded-r-2xl border-2 border-[var(--danger)]" : shift.planned ? "rounded-2xl border-2 border-dashed text-[var(--foreground)]" : "text-[#11121a] shadow-[inset_-2px_0_0_var(--card)]",
  )} style={style}>
    <span className="hidden truncate text-[11px] font-medium opacity-75 sm:block">{shift.day}</span>
    {/* Hours stay on phones: without them the bar is colour alone. */}
    <span className="block truncate text-xs font-semibold sm:text-sm">{formatMinutes(shift.minutes)}</span>
  </span>;
}

function Marker({ at, label, className, labelClassName }: { at: number; label: string; className: string; labelClassName: string }) {
  return <span className={cn("pointer-events-none absolute inset-y-0 z-10", className)} style={{ left: `${(at / SCALE_MINUTES) * 100}%` }}>
    <span className={cn("absolute -translate-x-1/2 whitespace-nowrap text-xs", labelClassName)}>{label}</span>
  </span>;
}
