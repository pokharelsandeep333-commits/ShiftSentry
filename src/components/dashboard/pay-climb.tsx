import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import type { PayClimbStep, WorkDay } from "@/lib/dashboard-insights";
import { formatCents } from "@/lib/earnings";
import type { JobSummary } from "@/lib/types";
import { buildJobLimitRows } from "@/lib/week-meter";
import { cn, formatMinutes } from "@/lib/utils";
import { TONE_TEXT } from "./week-card";
import styles from "./dashboard.module.css";

type Point = { t: number; cents: number };

/**
 * The week's pay as a line over time: flat between shifts, rising across each
 * one. Everything before now is earned; the rest is what the planned shifts
 * would add. A shift under way gets a point at now, so the line turns from
 * solid to dashed exactly where the earned figure stops.
 */
function climbPoints(steps: PayClimbStep[], weekStart: number, weekEnd: number, now: number) {
  const points: Point[] = [{ t: weekStart, cents: 0 }];
  let cents = 0;
  for (const step of steps) {
    const start = Date.parse(step.startsAt);
    const end = Date.parse(step.endsAt);
    points.push({ t: start, cents });
    if (start < now && now < end) points.push({ t: now, cents: cents + step.earnedNetCents });
    cents += step.earnedNetCents + step.plannedNetCents;
    points.push({ t: end, cents });
  }
  points.push({ t: weekEnd, cents });
  const split = points.findIndex((point) => point.t >= now);
  const earned = steps.reduce((total, step) => total + step.earnedNetCents, 0);
  if (split === -1) return { past: points, future: [] };
  if (points[split].t !== now) points.splice(split, 0, { t: now, cents: earned });
  return { past: points.slice(0, split + 1), future: points.slice(split) };
}

type PayClimbProps = {
  steps: PayClimbStep[];
  days: WorkDay[];
  jobs: JobSummary[];
  weekStartsAt: string;
  weekEndsAt: string;
  snapshotAt: string;
  timeZone: string;
  rangeLabel: string;
  remainingShiftCount: number;
};

/**
 * This week's pay, climbing a step with every shift. The cap card above is the
 * guardrail and carries the hours; this one is the reward and carries only
 * money, so the two never compete.
 */
export function PayClimb({ steps, days, jobs, weekStartsAt, weekEndsAt, snapshotAt, timeZone, rangeLabel, remainingShiftCount }: PayClimbProps) {
  const weekStart = Date.parse(weekStartsAt);
  const weekEnd = Date.parse(weekEndsAt);
  const now = Date.parse(snapshotAt);
  const earned = steps.reduce((total, step) => total + step.earnedNetCents, 0);
  const planned = steps.reduce((total, step) => total + step.plannedNetCents, 0);
  const projected = earned + planned;
  const { past, future } = climbPoints(steps, weekStart, weekEnd, now);
  // Leave headroom above the top step for its label.
  const scale = Math.max(projected, 1);
  const x = (t: number) => ((t - weekStart) / (weekEnd - weekStart)) * 100;
  const y = (cents: number) => 94 - (cents / scale) * 70;
  const line = (points: Point[]) => points.map((point, index) => `${index === 0 ? "M" : "L"}${(x(point.t) * 10).toFixed(2)},${y(point.cents).toFixed(2)}`).join(" ");
  const area = (points: Point[]) => points.length < 2 ? "" : `${line(points)} L${(x(points[points.length - 1].t) * 10).toFixed(2)},94 L${(x(points[0].t) * 10).toFixed(2)},94 Z`;
  const next = steps.find((step) => Date.parse(step.endsAt) > now && step.plannedNetCents > 0);
  const lastDay = days[days.length - 1];
  const endDay = lastDay ? formatInTimeZone(`${lastDay.date}T12:00:00Z`, "UTC", "EEEE") : "the end of the week";

  // One label per day, over the day's last step, so two short shifts on one
  // day do not stack two pills on top of each other.
  const labels = days.flatMap((day) => {
    const dayStart = fromZonedTime(`${day.date}T00:00:00`, timeZone).getTime();
    const dayEnd = fromZonedTime(`${day.date}T23:59:59.999`, timeZone).getTime();
    const onDay = steps.filter((step) => { const end = Date.parse(step.endsAt); return end > dayStart && end <= dayEnd + 1; });
    if (onDay.length === 0) return [];
    const cents = onDay.reduce((total, step) => total + step.earnedNetCents + step.plannedNetCents, 0);
    if (cents <= 0) return [];
    const last = onDay[onDay.length - 1];
    const top = steps.slice(0, steps.indexOf(last) + 1).reduce((total, step) => total + step.earnedNetCents + step.plannedNetCents, 0);
    const isNext = next ? onDay.includes(next) : false;
    const worked = onDay.every((step) => step.plannedNetCents === 0);
    return [{ date: day.date, cents, left: Math.min(93, Math.max(7, x(Date.parse(last.endsAt)))), bottom: 100 - y(top), color: last.jobColor, isNext, worked }];
  });

  return <section aria-labelledby="pay-climb-title" className={cn("premium-card border", styles.climb)}>
    <div className={styles.climbHead}>
      <div className="min-w-0">
        <h2 id="pay-climb-title" className="text-sm font-medium text-[var(--muted-foreground)]">Your pay this week <span aria-hidden="true">·</span> {rangeLabel}</h2>
        <p className={styles.climbEarned}>{formatCents(earned)}</p>
        <p className="mt-2 text-sm text-[var(--muted-foreground)]" title="After tax and deductions">
          {steps.length === 0 ? "Nothing logged or planned yet this week."
            : planned > 0 ? <>earned so far, <span className={styles.climbMoney}>{formatCents(projected)}</span> by {endDay} if you work what&apos;s planned</>
            : "earned this week, with nothing else planned."}
        </p>
      </div>
      {remainingShiftCount > 0 && <span className={styles.climbBadge}>{remainingShiftCount} shift{remainingShiftCount === 1 ? "" : "s"} to go</span>}
    </div>

    <div className={styles.climbPlot} aria-hidden="true">
      <svg className={styles.climbSvg} viewBox="0 0 1000 100" preserveAspectRatio="none">
        <line x1="0" y1="94" x2="1000" y2="94" className={styles.climbBaseline} vectorEffect="non-scaling-stroke" />
        <path d={area(past)} className={styles.climbAreaEarned} />
        <path d={area(future)} className={styles.climbAreaPlanned} />
        <path d={line(past)} className={styles.climbLineEarned} vectorEffect="non-scaling-stroke" />
        {future.length > 1 && <path d={line(future)} className={styles.climbLinePlanned} vectorEffect="non-scaling-stroke" />}
        <line x1={x(now) * 10} y1="6" x2={x(now) * 10} y2="94" className={styles.climbNowLine} vectorEffect="non-scaling-stroke" />
      </svg>
      <span className={styles.climbNow} style={{ left: `${x(now)}%`, top: `${y(earned)}%` }} />
      {planned > 0 && <span className={styles.climbGoal} style={{ left: "100%", top: `${y(projected)}%` }} />}
      {labels.map((label) => <span key={label.date} className={cn(styles.climbStep, label.isNext && styles.climbStepNext, label.worked && styles.climbStepWorked)} style={{ left: `${label.left}%`, bottom: `calc(${label.bottom}% + 8px)` }}>
        <i style={{ background: label.color }} />+{formatCents(label.cents)}
      </span>)}
    </div>
    <ol className={styles.climbDays} aria-hidden="true">
      {days.map((day) => <li key={day.date} className={cn(day.isToday && styles.climbToday)}><span>{day.weekday}</span><span>{day.dayNumber}</span></li>)}
    </ol>

    {steps.length > 0 && <ol className="sr-only" aria-label="Pay by shift this week">
      {steps.map((step) => <li key={step.id}>{step.jobName}, {formatInTimeZone(step.startsAt, timeZone, "EEEE h:mm a")}: {step.plannedNetCents > 0 ? `${formatCents(step.earnedNetCents + step.plannedNetCents)} planned` : `${formatCents(step.earnedNetCents)} earned`}</li>)}
    </ol>}

    <div className={styles.climbFoot}>
      {next ? <p className="min-w-0 text-sm text-[var(--muted-foreground)]">Next step: <Link href={`/shifts/${next.id}/edit`} className="font-semibold text-[var(--foreground)] underline-offset-4 hover:underline">{formatInTimeZone(next.startsAt, timeZone, "EEE h:mm a")}</Link>, <span title={next.jobName}>{next.jobName}</span>, <span className={styles.climbMoney}>+{formatCents(next.plannedNetCents)}</span></p>
        : steps.length === 0 ? <Link href="/shifts/new" className="text-sm font-semibold text-[var(--primary)] underline-offset-4 hover:underline">Add a shift</Link>
        : <p className="text-sm text-[var(--muted-foreground)]">That&apos;s the week. Nothing else planned.</p>}
      <JobLimits jobs={jobs} />
    </div>
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
