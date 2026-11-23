import type { CSSProperties, ReactNode } from "react";
import { Ban, BriefcaseBusiness, CalendarDays, Plus, TriangleAlert } from "lucide-react";
import { formatCents } from "@/lib/earnings";
import { cn, formatMinutes } from "@/lib/utils";
import { EXAMPLE_WEEK, tryShift, weekTotals } from "@/lib/welcome-week";
import { HowItWorksSteps } from "./how-it-works-steps";

/**
 * The landing's three steps (add jobs, log and plan shifts, stay under the
 * limit). Each step is a small illustration over a left-aligned title and
 * line, like every other section's text,
 * the illustrations joined by dashed, slowly moving connectors on wide
 * screens. The illustrations are built from the app's own pieces and the
 * example week the rest of the page uses (`welcome-week.ts`): the jobs, their
 * rates and cap, the week's shifts with Friday planned, 16 of 20 hours at the
 * 80% line, and the 5h café shift the trigger refuses. Every sentence is a
 * rule the app enforces: per-job rate, tax and optional cap,
 * `week_starts_on`, planned shifts counting toward hours, the 80% warning and
 * the refusal. Change the copy in the same change as the rule.
 *
 * Server component. Motion is CSS (`.hiw-*` in globals.css): the bars and
 * the limit bar growing in on scroll, and the floating pieces and the
 * connectors' moving dashes, which run a few cycles once their step is in
 * view (`HowItWorksSteps` marks it) and then rest. The steps themselves do not
 * fade in.
 */
const week = EXAMPLE_WEEK;
const totals = weekTotals(week);
const refusedMinutes = 300;
const refused = tryShift(week, { jobId: "cafe", minutes: refusedMinutes });
const jobById = new Map(week.jobs.map((job) => [job.id, job]));
const desk = week.jobs[0];
const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const tallest = Math.max(...week.shifts.map((shift) => shift.minutes));

export function HowItWorks({ className, titleClassName }: { className: string; titleClassName: string }) {
  return <section id="how" aria-labelledby="how-title" className={className}>
    <div className="max-w-xl">
      <h2 id="how-title" className={titleClassName}>Set it up once, then just log shifts.</h2>
      <p className="mt-4 text-[15px] leading-7 text-[var(--muted-foreground)] sm:text-base">A few minutes of setup. After that, ShiftSentry checks every shift against your limits before it is saved.</p>
    </div>

    <HowItWorksSteps className="hiw-steps mt-12 grid gap-14 sm:mt-14 lg:grid-cols-3 lg:gap-10">
      <Step title="Add your jobs." body="Give each one its hourly rate and tax, and its own weekly cap if it has one. Set your overall limit and the day your week starts." link>
        <JobsArt />
      </Step>
      <Step title="Log and plan shifts." body="Add the shifts you've worked and the ones coming up. Planned shifts count toward your hours as soon as you add them." link>
        <WeekArt />
      </Step>
      <Step title="Stay under your limit." body={`You're warned at ${week.alertPercent}% of your week. A shift that would take you past any cap is refused before it's saved.`}>
        <LimitArt />
      </Step>
    </HowItWorksSteps>
  </section>;
}

function Step({ title, body, link, children }: { title: string; body: string; link?: boolean; children: ReactNode }) {
  return <li className="relative">
    <div aria-hidden="true" className="hiw-art relative h-48 w-full max-w-[22rem]">{children}</div>
    {/* The connector to the next step, centred in the gap between illustrations. */}
    {link && <svg aria-hidden="true" viewBox="0 0 96 28" className="hiw-link absolute right-[-4.25rem] top-[5.25rem] hidden w-[6rem] lg:block" fill="none">
      <path d="M3 18C20 4 34 4 48 14s28 10 45-4" />
    </svg>}
    <h3 className="mt-8 font-display text-xl font-semibold">{title}</h3>
    <p className="mt-2.5 max-w-[36ch] text-[15px] leading-7 text-[var(--muted-foreground)]">{body}</p>
  </li>;
}

/* A floating piece: drifts a few times on its own clock, offset by `delay`. */
function Float({ className, delay, children }: { className: string; delay: number; children: ReactNode }) {
  return <div className={cn("hiw-float absolute", className)} style={{ "--hiw-delay": `${delay}ms` } as CSSProperties}>{children}</div>;
}

function JobsArt() {
  return <>
    <div className="hiw-card absolute left-[4%] top-[20%] w-[74%] p-3 text-left">
      <p className="flex items-center gap-2 text-[11px] font-semibold text-[var(--muted-foreground)]">
        <span className="grid size-6 place-items-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary)]"><BriefcaseBusiness className="size-3.5" /></span>Your jobs
      </p>
      <ul className="mt-2.5 space-y-1.5">
        {week.jobs.map((job) => <li key={job.id} className="flex items-center gap-2 rounded-lg bg-[var(--surface-subtle)] px-2 py-1.5 text-[12px]">
          <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: job.color }} />
          <span className="min-w-0 flex-1 truncate font-semibold">{job.name}</span>
          <span className="shrink-0 tabular-nums text-[var(--muted-foreground)]">{formatCents(job.hourlyRateCents)}/h</span>
        </li>)}
      </ul>
    </div>
    <Float className="right-[2%] top-[6%]" delay={0}>
      <span className="hiw-card inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold text-[var(--primary)]">
        <span className="size-1.5 rounded-full" style={{ backgroundColor: desk.color }} />{desk.limitMinutes === null ? "No cap" : `${formatMinutes(desk.limitMinutes)} cap`}
      </span>
    </Float>
    <Float className="bottom-[8%] right-[8%]" delay={900}>
      <span className="hiw-button grid size-11 place-items-center rounded-xl text-[var(--primary-foreground)]"><Plus className="size-5" strokeWidth={2.5} /></span>
    </Float>
  </>;
}

function WeekArt() {
  return <>
    <div className="hiw-card absolute inset-x-[8%] top-[22%] p-3">
      <p className="text-left text-[11px] font-semibold text-[var(--muted-foreground)]">This week</p>
      <div className="mt-2 grid h-[4.5rem] grid-cols-7 items-end gap-1.5">
        {DAYS.map((day) => {
          const shift = week.shifts.find((candidate) => candidate.day === day);
          const color = shift ? jobById.get(shift.jobId)?.color : undefined;
          return <span key={day} className="flex h-full flex-col justify-end">
            {shift
              ? <span className={cn("hiw-bar block rounded-md", shift.planned && "border-[1.5px] border-dashed")} style={{ height: `${(shift.minutes / tallest) * 100}%`, ...(shift.planned ? { borderColor: color, backgroundColor: `color-mix(in srgb, ${color} 18%, transparent)` } : { backgroundColor: color }) }} />
              : <span className="block h-1 rounded-full bg-[var(--surface-subtle)]" />}
          </span>;
        })}
      </div>
      <div className="mt-1.5 grid grid-cols-7 gap-1.5 text-[10px] text-[var(--muted-foreground)]">{DAYS.map((day) => <span key={day}>{day.slice(0, 1)}</span>)}</div>
    </div>
    <Float className="left-[2%] top-[4%]" delay={400}>
      <span className="hiw-card grid size-10 place-items-center text-[var(--primary)]"><CalendarDays className="size-[18px]" /></span>
    </Float>
    <Float className="right-0 top-[8%]" delay={1300}>
      <span className="hiw-card inline-flex items-center gap-1.5 border-dashed px-2.5 py-1.5 text-[11px] font-semibold" style={{ borderColor: desk.color }}>
        Fri, {formatMinutes(week.shifts.find((shift) => shift.planned)?.minutes ?? 0)} planned
      </span>
    </Float>
  </>;
}

function LimitArt() {
  return <>
    <div className="hiw-card absolute inset-x-[6%] top-[24%] p-3.5 text-left">
      <p className="text-[11px] font-semibold text-[var(--muted-foreground)]">Weekly limit</p>
      <p className="mt-1 font-display text-2xl font-semibold leading-none tabular-nums">{formatMinutes(totals.totalMinutes)}<span className="ml-1 font-sans text-xs font-normal text-[var(--muted-foreground)]">of {formatMinutes(week.limitMinutes)}</span></p>
      <span className="relative mt-3 block h-2 rounded-full bg-[var(--surface-subtle)]">
        <span className="hiw-fill absolute inset-y-0 left-0 rounded-full bg-[var(--warning)]" style={{ width: `${totals.percent}%` }} />
      </span>
    </div>
    <Float className="left-[0%] top-[6%]" delay={700}>
      <span className="hiw-card inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-semibold text-[var(--warning-ink)]"><TriangleAlert className="size-3.5" />{totals.percent}% of your week</span>
    </Float>
    {refused.status === "refused" && <Float className="bottom-[6%] right-[2%]" delay={1600}>
      <span className="hiw-card inline-flex items-center gap-1.5 border-[var(--danger)] px-2.5 py-1.5 text-[11px] font-semibold text-[var(--danger-ink)]"><Ban className="size-3.5" />+{formatMinutes(refusedMinutes)} café refused</span>
    </Float>}
  </>;
}
