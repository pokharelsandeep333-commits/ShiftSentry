"use client";

import { useActionState, useEffect, useId, useRef, useState, useSyncExternalStore, type CSSProperties, type RefObject } from "react";
import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { TimerReset } from "lucide-react";
import { discardShiftTimer, startShiftTimer, stopShiftTimer } from "@/app/actions/work";
import { buttonVariants } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { SubmitButton } from "@/components/ui/submit-button";
import { useToast } from "@/components/ui/toast-provider";
import { emptyTimerState, type TimerActionState } from "@/lib/form-state";
import { createLocalPreference } from "@/lib/local-preference";
import { LONG_TIMER_MS, MAX_SHIFT_MS, formatElapsed, limitCheckQuery, startedLabel, timerEditorHref, timerOutlook, type LimitCheckReply, type RunningTimer, type TimerOutlook } from "@/lib/shift-timer";
import { cn, formatMinutes } from "@/lib/utils";

type ClockJob = { id: string; name: string; color: string };

/**
 * The job last picked on the idle card, per device. Only an id: a job that was
 * archived or deleted since simply fails `isJob` below and the card falls back.
 */
const clockJobPreference = createLocalPreference<string | null>("shiftsentry:clock-job", null, (value) => (typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value) ? value : null));

type ShiftClockProps = {
  timer: RunningTimer | null;
  jobs: ClockJob[];
  timeZone: string;
  weekStartsOn: number;
  /** The server's clock at render, so the first client render reads the same elapsed time. */
  snapshotAt: string;
  /**
   * The job the idle card starts on, when it is one of `jobs`: the pages pass
   * the job of a shift under way or about to start (`suggestedClockJob`).
   * Without one, the card starts on the job last picked on this device
   * (`shiftsentry:clock-job`), which arrives after hydration and still applies
   * until the person taps a job themselves.
   */
  initialJobId?: string | null;
  /** Told each time the person picks a job, so a preference can remember it. */
  onJobChange?: (jobId: string) => void;
};

const CHECK_EVERY_MS = 60_000;

/**
 * Clock in / clock out: the day's main action on a phone. Idle, it is the
 * job chips and Start shift. Running, it is the clock, what stopping would meet
 * (the same advisory limit check the shift editor asks), Stop shift, and two
 * ways out for when stopping now is wrong: the editor filled in with these
 * times, and Discard. The timer itself lives in `shift_timers`, so it reads the
 * same after a reload or on another device.
 */
export function ShiftClock({ timer, jobs, timeZone, weekStartsOn, snapshotAt, initialJobId = null, onJobChange }: ShiftClockProps) {
  // Held here rather than in the running card: a successful stop revalidates
  // the page, the timer is gone and the running card unmounts in the same
  // render, so only a parent that stays mounted can confirm what was logged.
  const [stopState, stopAction] = useActionState(stopShiftTimer, emptyTimerState);
  const { toast } = useToast();
  const toasted = useRef<number | null>(null);
  useEffect(() => {
    if (stopState.loggedAt && stopState.loggedAt !== toasted.current) { toasted.current = stopState.loggedAt; toast(stopState.logged); }
  }, [stopState.loggedAt, stopState.logged, toast]);

  if (timer) return <RunningClock key={timer.startedAt} timer={timer} timeZone={timeZone} weekStartsOn={weekStartsOn} snapshotAt={snapshotAt} stopState={stopState} stopAction={stopAction} />;
  if (!jobs.length) return null;
  return <RememberingIdleClock jobs={jobs} initialJobId={initialJobId} onJobChange={onJobChange} />;
}

/** The idle card, starting on the suggested job (a shift under way or about to start), else the one last picked here. */
function RememberingIdleClock({ jobs, initialJobId, onJobChange }: { jobs: ClockJob[]; initialJobId: string | null; onJobChange?: (jobId: string) => void }) {
  const remembered = useSyncExternalStore(clockJobPreference.subscribe, clockJobPreference.read, clockJobPreference.serverSnapshot);
  const suggested = initialJobId && jobs.some((job) => job.id === initialJobId) ? initialJobId : null;
  return <IdleClock jobs={jobs} initialJobId={suggested ?? remembered} onJobChange={(jobId) => { clockJobPreference.write(jobId); onJobChange?.(jobId); }} />;
}

function IdleClock({ jobs, initialJobId, onJobChange }: { jobs: ClockJob[]; initialJobId: string | null; onJobChange?: (jobId: string) => void }) {
  const headingId = useId();
  const [state, action] = useActionState(startShiftTimer, emptyTimerState);
  // Null until the person taps a job, so the suggested or remembered one
  // (which may arrive after hydration) applies until then.
  const [picked, setPicked] = useState<string | null>(null);
  const isJob = (id: string | null): id is string => id !== null && jobs.some((job) => job.id === id);
  const chosen = isJob(picked) ? picked : isJob(initialJobId) ? initialJobId : jobs[0].id;
  const pick = (id: string) => { setPicked(id); onJobChange?.(id); };

  return <section aria-labelledby={headingId} className="premium-card mb-5 rounded-2xl border bg-[var(--card)] p-4 sm:p-5">
    {/* On a phone: the heading and Start share the first row and the job
        chips scroll sideways in one row under them, so the card takes two
        rows rather than one per job and the log stays near the top. From sm
        it is one row: heading, chips, Start. The wrapper is `contents` below
        sm so its children sit in the form's grid. */}
    <form action={action} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-3 sm:flex sm:flex-row sm:justify-between sm:gap-5">
      <div className="contents sm:flex sm:min-w-0 sm:items-center sm:gap-4">
        <h2 id={headingId} className="col-start-1 row-start-1 font-display text-lg font-semibold sm:shrink-0">Clock in</h2>
        {jobs.length === 1
          ? <p className="col-span-2 row-start-2 flex min-w-0 items-center gap-2 text-sm text-[var(--muted-foreground)]"><input type="hidden" name="jobId" value={chosen} /><Dot color={jobs[0].color} /><span className="truncate">{jobs[0].name}</span></p>
          : <fieldset className="col-span-2 row-start-2 min-w-0">
              <legend className="sr-only">Job</legend>
              <div className="shift-scroller -mx-4 -my-1 flex snap-x scroll-px-4 gap-2 overflow-x-auto px-4 py-1 sm:m-0 sm:flex-wrap sm:overflow-visible sm:p-0">
                {jobs.map((job) => <label key={job.id} className={cn(
                  "press relative flex min-h-11 shrink-0 snap-start cursor-pointer items-center gap-2 whitespace-nowrap rounded-full border px-3.5 text-sm font-medium transition-colors sm:min-h-9 sm:min-w-0 sm:max-w-full sm:shrink",
                  "has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-[var(--primary-soft)]",
                  chosen === job.id ? "border-[color-mix(in_srgb,var(--primary)_45%,var(--border))] bg-[var(--primary-soft)] text-[var(--foreground)]" : "bg-[var(--card)] text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
                )}>
                  <input type="radio" name="jobId" value={job.id} checked={chosen === job.id} onChange={() => pick(job.id)} className="sr-only" />
                  <Dot color={job.color} />
                  <span className="truncate">{job.name}</span>
                </label>)}
              </div>
            </fieldset>}
      </div>
      <SubmitButton label="Start shift" pendingLabel="Starting…" size="lg" className="col-start-2 row-start-1 rounded-full sm:shrink-0" />
    </form>
    {state.message && <Problem message={state.message} href={state.editHref} linkLabel="Edit that shift" />}
  </section>;
}

function RunningClock({ timer, timeZone, weekStartsOn, snapshotAt, stopState: state, stopAction: action }: { timer: RunningTimer; timeZone: string; weekStartsOn: number; snapshotAt: string; stopState: TimerActionState; stopAction: (formData: FormData) => void }) {
  const headingId = useId();
  const now = useNow(snapshotAt);
  const outlook = useTimerOutlook(timer, timeZone, weekStartsOn);
  const startedAt = new Date(timer.startedAt);
  const elapsed = now.getTime() - startedAt.getTime();
  const overDay = elapsed > MAX_SHIFT_MS;
  const editHref = timerEditorHref(timer, new Date(Math.floor(now.getTime() / 60_000) * 60_000), timeZone);
  const cardRef = useRef<HTMLElement>(null);
  const scrolledPast = useScrolledPast(cardRef);

  return <>
  <section ref={cardRef} aria-labelledby={headingId} className="premium-card relative mb-5 overflow-hidden rounded-2xl border bg-[var(--card)] p-4 sm:p-5" style={{ "--clock-job": timer.jobColor } as CSSProperties}>
    {/* The job's colour, as a soft wash from the leading edge: the owner's
        treatment for the shift under way in the Up next rail. */}
    <span aria-hidden="true" className="pointer-events-none absolute inset-0 bg-[linear-gradient(100deg,color-mix(in_srgb,var(--clock-job)_13%,transparent),transparent_55%)]" />
    <div className="relative flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <h2 id={headingId} tabIndex={-1} className="flex min-w-0 items-center gap-2 text-sm font-medium outline-none">
          <span aria-hidden="true" className="relative flex size-2.5 shrink-0">
            <span className="absolute inset-0 animate-ping rounded-full bg-[var(--clock-job)] opacity-60" />
            <span className="relative size-2.5 rounded-full bg-[var(--clock-job)]" />
          </span>
          <span className="truncate">On the clock · {timer.jobName}</span>
        </h2>
        <p className="mt-1.5 font-display text-[2.6rem] font-semibold leading-none tracking-[-0.035em] tabular-nums sm:text-5xl" role="timer" aria-label={`Running for ${formatMinutes(Math.floor(Math.max(0, elapsed) / 60_000))}`}>{formatElapsed(elapsed)}</p>
        <p className="mt-2 text-xs text-[var(--muted-foreground)]">Started {startedLabel(startedAt, now, timeZone)}{timer.adopted && <> · your {formatInTimeZone(timer.adopted.startsAt, timeZone, "h:mm a")}–{formatInTimeZone(timer.adopted.endsAt, timeZone, "h:mm a")} shift</>}</p>
      </div>
      {overDay
        ? <Link href={editHref} className={cn(buttonVariants({ size: "lg" }), "w-full rounded-full sm:w-auto")}><TimerReset className="size-4" aria-hidden="true" />Set end time</Link>
        : <form action={action} className="sm:shrink-0">
            <input type="hidden" name="startedAt" value={timer.startedAt} />
            <SubmitButton label="Stop shift" pendingLabel="Logging…" size="lg" className="w-full rounded-full sm:w-auto" />
          </form>}
    </div>

    <div className="relative mt-4 border-t pt-3">
      {/* A refused Stop says why below; the live line would only repeat it. */}
      {!state.message && <ClockOutlook outlook={outlook} now={now} elapsed={elapsed} archived={timer.jobArchived} timeZone={timeZone} />}
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        {!overDay && <Link href={editHref} className="inline-flex min-h-11 items-center text-sm font-semibold text-[var(--primary)] sm:min-h-9 transition-colors hover:text-[color-mix(in_srgb,var(--primary)_72%,var(--foreground))]">Stopped earlier? Set end time</Link>}
        <form action={discardShiftTimer} className="ml-auto">
          <input type="hidden" name="startedAt" value={timer.startedAt} />
          <ConfirmSubmit label="Discard" confirmLabel="Discard this timer?" detail="The clock stops and nothing is logged." />
        </form>
      </div>
    </div>
    {state.message && <Problem message={state.message} href={state.editHref} linkLabel="Fix the times" />}
  </section>
  {scrolledPast && <PinnedClock jobName={timer.jobName} jobColor={timer.jobColor} elapsed={elapsed} onShow={() => {
    cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    cardRef.current?.querySelector<HTMLElement>("h2")?.focus({ preventScroll: true });
  }} />}
  </>;
}

/**
 * While the running card is scrolled up out of view on a phone or tablet, a
 * slim bar above the bottom tabs keeps the clock in sight; a tap brings the
 * card back, where Stop and what stopping would meet are. It carries no Stop
 * of its own, so a refusal is always read where it is explained. The bottom
 * tabs, and so this bar, are gone from lg up.
 */
function PinnedClock({ jobName, jobColor, elapsed, onShow }: { jobName: string; jobColor: string; elapsed: number; onShow: () => void }) {
  return <button type="button" onClick={onShow} className="press fixed inset-x-3 bottom-[calc(4.6rem+env(safe-area-inset-bottom))] z-20 flex min-h-12 items-center gap-2.5 rounded-full border bg-[var(--card)]/95 px-4 text-left text-sm shadow-lg shadow-black/10 backdrop-blur-xl outline-none focus-visible:ring-4 focus-visible:ring-[var(--primary-soft)] sm:inset-x-auto sm:right-6 sm:min-w-72 lg:hidden" style={{ "--clock-job": jobColor } as CSSProperties}>
    <span aria-hidden="true" className="relative flex size-2.5 shrink-0">
      <span className="absolute inset-0 animate-ping rounded-full bg-[var(--clock-job)] opacity-60" />
      <span className="relative size-2.5 rounded-full bg-[var(--clock-job)]" />
    </span>
    <span className="min-w-0 flex-1 truncate font-medium">On the clock · {jobName}</span>
    <span className="font-display font-semibold tabular-nums">{formatElapsed(elapsed)}</span>
    <span className="sr-only">. Show the timer</span>
  </button>;
}

/** True once the element has scrolled up past the top of the viewport (not when it is below it). */
function useScrolledPast(ref: RefObject<HTMLElement | null>) {
  const [past, setPast] = useState(false);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(([entry]) => setPast(!entry.isIntersecting && entry.boundingClientRect.top < 0));
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return past;
}

/** One line under the clock: what stopping now would meet, and when a limit would be reached. */
function ClockOutlook({ outlook, now, elapsed, archived, timeZone }: { outlook: TimerOutlook | null; now: Date; elapsed: number; archived: boolean; timeZone: string }) {
  const tone = (kind: "quiet" | "warn" | "bad") => cn("text-sm leading-6", kind === "quiet" && "text-[var(--muted-foreground)]", kind === "warn" && "text-[var(--warning-ink)]", kind === "bad" && "text-[var(--danger-ink)]");

  if (archived) return <p className={tone("bad")}>This job was archived while the shift was running. Restore it under Jobs to log it, or discard the timer.</p>;
  if (elapsed > MAX_SHIFT_MS) return <p className={tone("bad")}>Over 24 hours, longer than one shift can be. Set the time you actually stopped.</p>;
  if (elapsed > LONG_TIMER_MS) return <p className={tone("warn")}>Still working after {formatMinutes(Math.floor(elapsed / 60_000))}? If you stopped earlier, set the end time instead.</p>;
  if (!outlook) return <p className={tone("quiet")}>Stop when you finish and the shift is logged with your usual checks.</p>;

  if (outlook.kind === "refused") {
    if (outlook.reason === "overlap" && outlook.overlap) {
      const span = `${formatInTimeZone(outlook.overlap.startsAt, timeZone, "h:mm a")}–${formatInTimeZone(outlook.overlap.endsAt, timeZone, "h:mm a")}`;
      return <p className={tone("bad")}>Overlaps {outlook.overlap.jobName} {span}, so stopping now would be refused.</p>;
    }
    if (outlook.reason === "span") return <p className={tone("bad")}>Over 24 hours, longer than one shift can be. Set the time you actually stopped.</p>;
    return <p className={tone("bad")}>Past {outlook.reason === "job" ? "this job's" : "your"} weekly limit, so stopping now would be refused. Set an earlier end time or discard.</p>;
  }

  if (!outlook.limit) return <p className={tone("quiet")}>No weekly limit applies to this shift.</p>;
  const which = outlook.limit === "job" ? "this job's weekly limit" : "your weekly limit";
  if (!outlook.capAt) return <p className={tone("quiet")}>{formatMinutes(outlook.remainingMinutes ?? 0)} left under {which} this week.</p>;
  const left = Math.max(0, Math.round((outlook.capAt.getTime() - 60_000 - now.getTime()) / 60_000));
  // A deadline half a day away is not one; a nearer one names its weekday when it is not today.
  if (left > 12 * 60) return <p className={tone("quiet")}>{formatMinutes(left)} left under {which} this week.</p>;
  const at = startedLabel(new Date(outlook.capAt.getTime() - 60_000), now, timeZone);
  return <p className={tone(left <= 60 ? "warn" : "quiet")}>{left > 0 ? <>{formatMinutes(left)} left under {which}. Stop by <span className="font-semibold tabular-nums">{at}</span>.</> : <>You have reached {which}. Stop now to log this shift.</>}</p>;
}

function Problem({ message, href, linkLabel }: { message: string; href: string | null; linkLabel: string }) {
  return <p role="alert" className="relative mt-3 rounded-xl bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2.5 text-sm leading-6 text-[var(--danger-ink)]">
    {message}{href && <> <Link href={href} className="font-semibold transition-colors hover:text-[var(--primary)]">{linkLabel}</Link></>}
  </p>;
}

function Dot({ color }: { color: string }) {
  return <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ background: color }} />;
}

/** The current time, ticking each second, starting from the server's clock so hydration matches. */
function useNow(snapshotAt: string) {
  const [now, setNow] = useState(() => new Date(snapshotAt));
  useEffect(() => {
    const tick = () => setNow(new Date());
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

/**
 * Asks `GET /shifts/limit-check` what stopping now would meet: on mount, each
 * minute, and when the tab comes back into view (a phone in a pocket throttles
 * timers). The route is the shift editor's, so the card and the editor can
 * never disagree, and like there it is advisory: the database decides on Stop.
 * A failed check simply leaves the line generic.
 */
function useTimerOutlook(timer: RunningTimer, timeZone: string, weekStartsOn: number) {
  const [outlook, setOutlook] = useState<TimerOutlook | null>(null);
  const { jobId, startedAt, adopted } = timer;
  const adoptedId = adopted?.shiftId ?? null;
  useEffect(() => {
    let controller: AbortController | null = null;
    async function check() {
      const checkedAt = new Date();
      const query = limitCheckQuery({ jobId, startedAt, adopted: adoptedId ? { shiftId: adoptedId } : null }, checkedAt, timeZone);
      if (!query) return;
      controller?.abort();
      controller = new AbortController();
      try {
        const response = await fetch(`/shifts/limit-check?${query}`, { cache: "no-store", signal: controller.signal });
        if (!response.ok) return;
        const reply = await response.json() as LimitCheckReply | { status: string };
        if (reply.status === "ok") setOutlook(timerOutlook(reply as LimitCheckReply, checkedAt, timeZone, weekStartsOn));
      } catch {
        // Aborted or offline: keep the last answer.
      }
    }
    void check();
    const interval = window.setInterval(() => void check(), CHECK_EVERY_MS);
    const onVisible = () => { if (document.visibilityState === "visible") void check(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearInterval(interval); document.removeEventListener("visibilitychange", onVisible); controller?.abort(); };
  }, [jobId, startedAt, adoptedId, timeZone, weekStartsOn]);
  return outlook;
}
