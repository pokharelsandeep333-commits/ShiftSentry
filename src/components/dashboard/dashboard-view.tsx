"use client";

import { useEffect, useId, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { ArrowRight, ChevronDown } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { NextShiftCard } from "@/components/dashboard/next-shift-card";
import { WeekCard, WeekJobLimits } from "@/components/dashboard/week-card";
import { WorkWeek } from "@/components/dashboard/work-week";
import { PaydaySummary } from "@/components/dashboard/payday-summary";
import { WeeklyPayForecast } from "@/components/dashboard/weekly-pay-forecast";
import { RecentShifts } from "@/components/dashboard/recent-shifts";
import { PremiumSelect } from "@/components/ui/premium-select";
import { Reveal } from "@/components/ui/reveal";
import { formatCents } from "@/lib/earnings";
import { EARNINGS_RANGE_PRESETS, monthKeyLabel, monthRangeForPreset, monthSpanLabel, selectMonths, type EarningsRangePreset } from "@/lib/earnings-range";
import { greetingForDate } from "@/lib/greeting";
import { createLocalPreference } from "@/lib/local-preference";
import { niceAxisTicks } from "@/lib/chart-ticks";
import { combineMonthTotals } from "@/lib/period-totals";
import { addDays, daysBetween, formatPayDay, formatPayPeriod, type PayPeriodSummary } from "@/lib/pay-period";
import { weekEndFor, weekStartFor } from "@/lib/time";
import { cn, formatMinutes } from "@/lib/utils";
import type { DashboardData, DashboardTotals, MonthlyJobAllocation, PeriodJobTotal } from "@/lib/types";
import styles from "./dashboard.module.css";

const HOVER_POINTER_QUERY = "(hover: hover) and (pointer: fine)";

/**
 * The media query only describes the browser's idea of the *primary* pointer,
 * and a touch laptop is where that idea goes wrong: some browsers report it as
 * coarse and the chart would sit in tap mode under a mouse. A real event is
 * definitive, so the first one observed overrides the guess -- and keeps
 * following the viewer, so a finger on that same laptop gets the tap readout.
 */
let observedPointerType: "mouse" | "touch" | null = null;
const pointerListeners = new Set<() => void>();

function notePointerType(event: PointerEvent) {
  const next = event.pointerType === "touch" ? "touch" : "mouse";
  if (next === observedPointerType) return;
  observedPointerType = next;
  pointerListeners.forEach((listener) => listener());
}

function subscribeToPointer(listener: () => void) {
  const query = window.matchMedia(HOVER_POINTER_QUERY);
  query.addEventListener("change", listener);
  if (pointerListeners.size === 0) {
    // `pointerover` rather than `pointermove`: it fires once per element
    // crossed instead of once per pixel, and a mouse still declares itself
    // long before it reaches a bar.
    window.addEventListener("pointerover", notePointerType, { passive: true });
    window.addEventListener("pointerdown", notePointerType, { passive: true });
  }
  pointerListeners.add(listener);
  return () => {
    query.removeEventListener("change", listener);
    pointerListeners.delete(listener);
    if (pointerListeners.size === 0) {
      window.removeEventListener("pointerover", notePointerType);
      window.removeEventListener("pointerdown", notePointerType);
    }
  };
}

function readHoverPointer() {
  if (observedPointerType) return observedPointerType === "mouse";
  return window.matchMedia(HOVER_POINTER_QUERY).matches;
}

/**
 * Touch has no hover, so a floating tooltip appears under the finger that
 * summoned it and vanishes the moment the finger lifts. Touch gets a pinned
 * readout below the chart instead; the server snapshot assumes a mouse.
 */
function useHoverPointer() {
  return useSyncExternalStore(subscribeToPointer, readHoverPointer, () => true);
}

export function DashboardView({ data }: { data: DashboardData }) {
  // Nothing has been set up yet, so there is nothing to total. The full
  // dashboard here is a wall of zeros -- an empty hero, four $0.00 metrics, two
  // blank charts and three separate empty states -- which says what is missing
  // without saying what to do about it.
  if (!data.isDemo && data.jobs.length === 0) return <div className={styles.root}><DashboardHeading data={data} /><FirstRun /></div>;

  return <div className={styles.root}>
    <DashboardHeading data={data} />
    <WeekCard jobs={data.jobs} workedMinutes={data.totals.week.minutes} limitMinutes={data.globalLimitMinutes} rangeLabel={weekRangeLabel(data.viewer, data.snapshotAt)} upcomingCount={new Set(data.weekDays.flatMap((day) => day.shifts).filter((shift) => Date.parse(shift.startsAt) > Date.parse(data.snapshotAt)).map((shift) => shift.id)).size} />

    {/* Daily work stays with weekly capacity; upcoming work and pay share
        a compact rail without stretching either surface. */}
    <section className={styles.topGrid}>
      <Reveal className="min-w-0" delay={0.05}><Card className="flex h-full min-w-0 flex-col p-5 sm:p-6">
        <WorkWeek days={data.weekDays} timeZone={data.viewer.timeZone} />
        <WeekJobLimits jobs={data.jobs} />
      </Card></Reveal>
      <aside className={cn("premium-card", styles.rail)} aria-label="Upcoming work and pay">
        <NextShiftCard current={data.currentShift} upcoming={data.upcomingShifts} timeZone={data.viewer.timeZone} snapshotAt={data.snapshotAt} />
        <PaydaySummary periods={data.payPeriods} snapshotAt={data.snapshotAt} timeZone={data.viewer.timeZone} onShowDetails={() => payPeriodsPreference.write("open")} />
      </aside>
    </section>
    <WeeklyPayForecast earnedNetCents={data.totals.week.earnings.netCents} forecast={data.weekForecast} rangeLabel={weekRangeLabel(data.viewer, data.snapshotAt)} />

    {/* Then money: what this period came to, beside how it compares with the
        months before. Pay periods, when a job has a schedule, close the page. */}
    <section className="mt-5 grid grid-cols-1 items-stretch gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <Reveal className="min-w-0"><EarningsCard totals={data.totals} comparison={data.weekComparison} /></Reveal>
      <Reveal className="min-w-0" delay={0.06}><HistoryChart allocation={data.monthlyJobAllocation} /></Reveal>
    </section>

    <RecentShifts shifts={data.recentShifts} timeZone={data.viewer.timeZone} />
    {data.payPeriods.length > 0 && <Reveal><PayPeriodsCard periods={data.payPeriods} /></Reveal>}
  </div>;
}

/** A job with no deductions configured was reading "−$0.00", which announces a
 *  subtraction that never happened. Nothing taken means no sign. */
function withheld(cents: number) {
  return cents === 0 ? formatCents(0) : `−${formatCents(cents)}`;
}

type StoredEarningsRange = { preset: EarningsRangePreset; custom: { from: string; to: string } | null };

const DEFAULT_EARNINGS_RANGE: StoredEarningsRange = { preset: "week", custom: null };

function reviveEarningsRange(parsed: unknown): StoredEarningsRange | null {
  if (!parsed || typeof parsed !== "object") return null;
  const value = parsed as Partial<StoredEarningsRange>;
  const preset = EARNINGS_RANGE_PRESETS.find((entry) => entry.key === value.preset)?.key;
  if (!preset) return null;
  const custom = value.custom && typeof value.custom.from === "string" && typeof value.custom.to === "string" ? { from: value.custom.from, to: value.custom.to } : null;
  return { preset, custom };
}

const earningsRange = createLocalPreference<StoredEarningsRange>("shiftsentry:earnings-range", DEFAULT_EARNINGS_RANGE, reviveEarningsRange);

/**
 * The remembered range, and whether the client has taken over from the server.
 *
 * localStorage cannot be read while the server renders, so the first paint is
 * always "This week" and the remembered choice arrives on the first client
 * render. `hydrated` exists to re-key the uncontrolled listbox at that moment,
 * which is the only time its internal value can disagree with the store.
 */
function useStoredEarningsRange() {
  const range = useSyncExternalStore(earningsRange.subscribe, earningsRange.read, earningsRange.serverSnapshot);
  const hydrated = useSyncExternalStore(earningsRange.subscribe, () => true, () => false);
  return { range, hydrated, setRange: earningsRange.write };
}

function EarningsCard({ totals, comparison }: { totals: DashboardTotals; comparison: DashboardData["weekComparison"] }) {
  const pickerId = useId();
  const months = totals.months;
  const { range: stored, hydrated, setRange } = useStoredEarningsRange();
  const { preset, custom } = stored;

  const span = useMemo(() => {
    const selection = preset === "week" ? null : preset === "custom" ? custom : monthRangeForPreset(preset, months);
    const first = months[0]?.key;
    const last = months[months.length - 1]?.key;
    if (!selection || !first || !last) return null;
    // Ordered here rather than policed at the picker, so choosing an end month
    // before the start one reads as the span between them instead of emptying
    // the card with no way to tell why. Then clamped, because a remembered span
    // outlives the data it described -- archiving a job moves the first month
    // worked, and a stored range pointing outside the history would read zero.
    const [from, to] = selection.from <= selection.to ? [selection.from, selection.to] : [selection.to, selection.from];
    const clamp = (key: string) => key < first ? first : key > last ? last : key;
    return { from: clamp(from), to: clamp(to) };
  }, [custom, months, preset]);

  const summary = useMemo(
    () => preset === "week" ? totals.week : combineMonthTotals(span ? selectMonths(months, span.from, span.to) : []),
    [months, preset, span, totals.week],
  );

  /**
   * The same listbox the From/To pickers use, and deliberately so: Radix's menu
   * carries the portal, floating-ui autoUpdate, scroll lock and focus guards
   * that `premium-select.tsx` documents as the reason Radix Select was dropped,
   * and a range picker is opened far more often than an account menu is.
   *
   * An active custom span replaces the generic label, so the trigger still
   * states the period the figures below it cover.
   */
  const rangeOptions = useMemo(() => EARNINGS_RANGE_PRESETS
    // With no history every month preset totals zero, which would be six ways
    // of reading the same empty card.
    .filter((entry) => entry.key === "week" || months.length > 0)
    .map((entry) => ({
      value: entry.key,
      label: entry.key === "custom" && preset === "custom" && span ? monthSpanLabel(span.from, span.to) : entry.label,
    })), [months.length, preset, span]);

  const description = preset === "week" ? "Worked so far, including a shift under way."
    : !span ? "Nothing has been logged yet."
    : span.from === span.to ? `Everything you worked in ${monthKeyLabel(span.from)}.`
    : `Everything you worked from ${monthKeyLabel(span.from)} to ${monthKeyLabel(span.to)}.`;

  const monthOptions = months.map((month) => ({ value: month.key, label: month.label }));

  function choosePreset(next: EarningsRangePreset) {
    // Opening the custom picker on a blank pair would show zeros; it starts on
    // the last three months, which is the span most people narrow from.
    setRange({ preset: next, custom: next === "custom" ? custom ?? monthRangeForPreset("last3", months) : custom });
  }

  return <Card className="@container min-w-0 h-full">
    <CardHeader>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 basis-48">
          <CardTitle>Earnings</CardTitle>
          <CardDescription className="mt-2">{description}</CardDescription>
        </div>
        <div className="w-full @min-[28rem]:w-44 @min-[28rem]:shrink-0">
          <span id={`${pickerId}-range`} className="sr-only">Earnings period</span>
          <PremiumSelect key={hydrated ? "hydrated" : "initial"} name="earnings-range" labelledBy={`${pickerId}-range`} defaultValue={preset} options={rangeOptions} onValueChange={(value) => choosePreset(value as EarningsRangePreset)} />
        </div>
      </div>
    </CardHeader>
    <CardContent>
      {preset === "custom" && custom && <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <div>
          <p id={`${pickerId}-from`} className="mb-1.5 text-sm font-medium text-[var(--muted-foreground)]">From</p>
          <PremiumSelect name="earnings-range-from" labelledBy={`${pickerId}-from`} defaultValue={custom.from} options={monthOptions} onValueChange={(value) => setRange({ preset, custom: { from: value, to: custom.to } })} />
        </div>
        <div>
          <p id={`${pickerId}-to`} className="mb-1.5 text-sm font-medium text-[var(--muted-foreground)]">To</p>
          <PremiumSelect name="earnings-range-to" labelledBy={`${pickerId}-to`} defaultValue={custom.to} options={monthOptions} onValueChange={(value) => setRange({ preset, custom: { from: custom.from, to: value } })} />
        </div>
      </div>}
      {/* Net is the answer, so it is the one large figure; hours sit beside it.
          Gross, tax and deductions explain it, so they read as one receipt line
          under it rather than three boxes as loud as the answer. */}
      <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-3">
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--muted-foreground)]">Net earned</p>
          <p className="mt-1 whitespace-nowrap font-display text-[2.5rem] font-semibold leading-none tracking-[-0.035em] tabular-nums text-[color-mix(in_srgb,var(--success)_78%,var(--foreground))] sm:text-[3.1rem]">{formatCents(summary.earnings.netCents)}</p>
        </div>
        <div className="text-right">
          <p className="text-sm font-medium text-[var(--muted-foreground)]">Hours worked</p>
          <p className="mt-1 whitespace-nowrap font-display text-2xl font-semibold tabular-nums">{formatMinutes(summary.minutes)}</p>
        </div>
      </div>
      {preset === "week" && <WeeklyComparison current={totals.week} comparison={comparison} />}
      <dl className="mt-5 grid grid-cols-1 gap-3 border-y py-3 text-sm @min-[22rem]:grid-cols-3 @min-[22rem]:gap-0 @min-[22rem]:divide-x">
        <ReceiptItem label="Gross" value={formatCents(summary.earnings.grossCents)} />
        <ReceiptItem label="Tax" value={withheld(summary.earnings.taxCents)} />
        <ReceiptItem label="Deductions" value={withheld(summary.earnings.deductionCents)} />
      </dl>
      <JobSplit jobs={summary.jobs} total={summary.earnings.netCents} />
    </CardContent>
  </Card>;
}

function WeeklyComparison({ current, comparison }: { current: DashboardTotals["week"]; comparison: DashboardData["weekComparison"] }) {
  const netChange = current.earnings.netCents - comparison.previous.earnings.netCents;
  const hoursChange = current.minutes - comparison.previous.minutes;
  const signed = (value: number, format: (value: number) => string) => value === 0 ? "No change" : `${value > 0 ? "+" : "−"}${format(Math.abs(value))}`;
  return <div className={styles.comparison}>
    <p className="text-xs font-medium text-[var(--muted-foreground)]">Compared with last week through {comparison.throughLabel}</p>
    <dl>
      <div><dt className="text-xs text-[var(--muted-foreground)]">Net pay</dt><dd className="mt-1 text-sm font-semibold tabular-nums">{signed(netChange, formatCents)}</dd><dd className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">{formatCents(comparison.previous.earnings.netCents)} last week</dd></div>
      <div><dt className="text-xs text-[var(--muted-foreground)]">Hours worked</dt><dd className="mt-1 text-sm font-semibold tabular-nums">{signed(hoursChange, formatMinutes)}</dd><dd className="mt-0.5 text-[11px] text-[var(--muted-foreground)]">{formatMinutes(comparison.previous.minutes)} last week</dd></div>
    </dl>
  </div>;
}

const payPeriodsPreference = createLocalPreference<"open" | "closed">("shiftsentry:pay-periods", "closed", (value) => (value === "open" || value === "closed" ? value : null));

/**
 * Whether the pay periods card is open, and whether it may animate yet.
 *
 * Closed on first use, then remembered per device. Only user interaction
 * animates; hydration restores the preference without a folding animation.
 */
function usePayPeriodsOpen() {
  const open = useSyncExternalStore(payPeriodsPreference.subscribe, payPeriodsPreference.read, payPeriodsPreference.serverSnapshot) === "open";
  const [canAnimate, setCanAnimate] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setCanAnimate(true));
    return () => cancelAnimationFrame(frame);
  }, []);
  return { open, canAnimate, toggle: () => payPeriodsPreference.write(open ? "closed" : "open") };
}

/**
 * The pay period each scheduled job is in, as its employer counts it. One tile
 * per job, because two jobs' periods do not line up and a sum of them would
 * match no paycheck. "So far" is worked time clipped at now, the same rule as
 * every other earnings figure; scheduled shifts left in the period are shown as
 * a projection on top, never folded into what has been earned.
 * Hiding it keeps the header, so it can always be brought back.
 */
function PayPeriodsCard({ periods }: { periods: PayPeriodSummary[] }) {
  const contentId = useId();
  const { open, canAnimate, toggle } = usePayPeriodsOpen();

  return <Card id="pay-periods" className="mt-5 scroll-mt-5">
    <CardHeader>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle>Pay periods</CardTitle>
          <CardDescription className="mt-2">{open ? "Estimated from your rates, on each job’s own pay schedule." : `${periods.length} job${periods.length === 1 ? "" : "s"} with a pay schedule. Show to see each period.`}</CardDescription>
        </div>
        <button type="button" onClick={toggle} aria-expanded={open} aria-controls={contentId} aria-label={open ? "Hide pay periods" : "Show pay periods"} className="press -mr-1 -mt-1 grid size-11 shrink-0 place-items-center rounded-xl text-[var(--muted-foreground)] hover:bg-[var(--surface-subtle)] hover:text-[var(--foreground)] focus-visible:ring-4 focus-visible:ring-[var(--primary-soft)] sm:size-9">
          <ChevronDown className={cn("size-4 transition-transform duration-[var(--dur-morph)] ease-[var(--ease-out)]", !open && "-rotate-90")} />
        </button>
      </div>
    </CardHeader>
    <div id={contentId} inert={!open} className={cn("card-collapse", open && "is-open", canAnimate && "can-animate")}>
      <div>
        <CardContent className={cn("grid grid-cols-1 gap-4", periods.length > 1 && "md:grid-cols-2", periods.length > 2 && "2xl:grid-cols-3")}>
          {periods.map((period) => <PayPeriodTile key={period.jobId} period={period} />)}
        </CardContent>
      </div>
    </div>
  </Card>;
}

function PayPeriodTile({ period }: { period: PayPeriodSummary }) {
  const { current, previous } = period;
  const length = daysBetween(current.start, current.end);
  // The viewer's local today, recovered from the server's count rather than the
  // browser clock, so the wording cannot disagree with "days left".
  const today = addDays(current.end, -current.daysLeft);
  const elapsedPercent = Math.round(((length - current.daysLeft + 1) / length) * 100);
  const projected = { minutes: current.worked.minutes + current.scheduled.minutes, netCents: current.worked.netCents + current.scheduled.netCents };

  // One tile per job, no boxes inside it: the period, how far through it is,
  // what it has come to so far, and the last period as a footnote.
  return <div className="flex min-w-0 flex-col border-t pt-4">
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="flex min-w-0 items-center gap-2.5 font-semibold"><span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ background: period.jobColor }} /><span className="truncate" title={period.jobName}>{period.jobName}</span></span>
      <span className="shrink-0 text-xs font-semibold text-[var(--muted-foreground)]">{current.daysLeft === 1 ? "Last day" : `${current.daysLeft} days left`}</span>
    </div>
    <p className="mt-1 text-sm text-[var(--muted-foreground)]"><span className="font-medium text-[var(--foreground)]">{formatPayPeriod(current)}</span> · {period.scheduleLabel}</p>
    <span aria-hidden="true" className="mt-3 flex h-1.5 rounded-full bg-[color-mix(in_srgb,var(--foreground)_8%,transparent)]"><span className="h-full rounded-full" style={{ width: `${elapsedPercent}%`, background: period.jobColor }} /></span>
    <div className="mt-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <p><span className="font-display text-2xl font-semibold tabular-nums text-[color-mix(in_srgb,var(--success)_78%,var(--foreground))]">{formatCents(current.worked.netCents)}</span> <span className="text-sm text-[var(--muted-foreground)]">net so far</span></p>
      <p className="text-sm tabular-nums"><span className="font-semibold">{formatMinutes(current.worked.minutes)}</span> <span className="text-[var(--muted-foreground)]">worked</span></p>
    </div>
    <dl className="mt-3 space-y-1.5 text-sm">
      {current.scheduled.minutes > 0 && <div className="flex justify-between gap-3"><dt className="text-[var(--muted-foreground)]">With scheduled shifts</dt><dd className="whitespace-nowrap font-semibold tabular-nums">{formatCents(projected.netCents)} · {formatMinutes(projected.minutes)}</dd></div>}
      {current.payday && <div className="flex justify-between gap-3"><dt className="text-[var(--muted-foreground)]">Expected payday</dt><dd className="whitespace-nowrap font-semibold">{formatPayDay(current.payday, true)}</dd></div>}
    </dl>
    <div className="mt-auto pt-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-t border-[color-mix(in_srgb,var(--foreground)_8%,transparent)] pt-3 text-sm">
        <span className="text-[var(--muted-foreground)]">Last period · {formatPayPeriod(previous)}</span>
        <span className="whitespace-nowrap font-semibold tabular-nums">{formatCents(previous.worked.netCents)} · {formatMinutes(previous.worked.minutes)}</span>
      </div>
      {previous.payday && <p className="mt-1 text-xs text-[var(--muted-foreground)]">{previous.payday >= today ? "Expected" : "Paid around"} {formatPayDay(previous.payday, true)}</p>}
    </div>
  </div>;
}

// The value never wraps: an all-time figure broke across lines at 390px and left
// the minus sign stranded above the amount, which reads as a positive number.
function ReceiptItem({ label, value }: { label: string; value: string }) {
  return <div className="flex min-w-0 items-baseline justify-between gap-2 @min-[22rem]:block @min-[22rem]:px-3 first:pl-0 last:pr-0">
    <dt className="text-xs font-medium text-[var(--muted-foreground)]">{label}</dt>
    <dd className="mt-1 whitespace-nowrap font-semibold tabular-nums">{value}</dd>
  </div>;
}

/** Each job's share of the period's net: one bar, then the jobs largest first. */
function JobSplit({ jobs, total }: { jobs: PeriodJobTotal[]; total: number }) {
  if (!jobs.length) return <p className="mt-5 text-sm text-[var(--muted-foreground)]">No worked shifts in this period.</p>;
  const ordered = [...jobs].sort((left, right) => right.netCents - left.netCents);
  return <div className="mt-5">
    <h4 className="mb-3 text-sm font-semibold">By job</h4>
    {total > 0 && <div aria-hidden="true" className="flex h-2 gap-[3px]">
      {ordered.filter((job) => job.netCents > 0).map((job) => <span key={job.id} className="h-full rounded-full" style={{ width: `${(job.netCents / total) * 100}%`, background: job.color }} />)}
    </div>}
    <ul className="mt-3 grid gap-0.5">
      {ordered.map((job) => <li key={job.id} className={styles.jobEarning}>
        <span className="flex min-w-0 items-center gap-2.5">
          <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ background: job.color }} />
          <span className="min-w-0 break-words text-sm font-medium [overflow-wrap:anywhere]">{job.name}</span>
        </span>
        <span className="whitespace-nowrap text-right text-sm font-semibold tabular-nums">{formatCents(job.netCents)}</span>
      </li>)}
    </ul>
  </div>;
}

const BAR_CAP_RADIUS = 8;

// Recharts applies `radius` to every segment of a stack, which turns the middle
// pieces into pills. Cap only the topmost segment that actually has value this
// month so the stack still reads as one column.
function topmostSeriesKey(payload: Record<string, unknown>, seriesKeys: string[]) {
  for (let index = seriesKeys.length - 1; index >= 0; index -= 1) {
    if (Number(payload[seriesKeys[index]] ?? 0) > 0) return seriesKeys[index];
  }
  return null;
}

function StackedBarShape({ seriesKey, seriesKeys = [], pinnedMonthKey = null, payload = {}, x = 0, y = 0, width = 0, height = 0, fill }: {
  seriesKey?: string;
  seriesKeys?: string[];
  pinnedMonthKey?: string | null;
  payload?: Record<string, unknown>;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  fill?: string;
}) {
  if (width <= 0 || height <= 0) return null;
  // Clamp to the segment height, or a thin top slice renders the curve as a smear.
  const radius = seriesKey === topmostSeriesKey(payload, seriesKeys) ? Math.min(BAR_CAP_RADIUS, width / 2, height) : 0;
  // Only once a month is actually pinned, so the default view is never dimmed.
  const opacity = pinnedMonthKey && payload.monthKey !== pinnedMonthKey ? 0.35 : 1;
  if (!radius) return <rect x={x} y={y} width={width} height={height} fill={fill} opacity={opacity} />;

  return <path fill={fill} opacity={opacity} d={`M${x},${y + height} L${x},${y + radius} Q${x},${y} ${x + radius},${y} L${x + width - radius},${y} Q${x + width},${y} ${x + width},${y + radius} L${x + width},${y + height} Z`} />;
}

type MonthBreakdownData = { label: string; rows: { key: string; name: string; color: string; value: number }[]; total: number };

/**
 * One month, split by job, largest share first, with the month's total.
 *
 * Jobs worth nothing that month are dropped rather than listed as zeroes: with
 * nine jobs plus "Other", a stack of three real bars used to come with seven
 * $0.00 rows, and the number the viewer wanted -- what the month came to -- was
 * the one thing they had to work out themselves.
 */
function breakdownFor(allocation: MonthlyJobAllocation, monthKey: string | null, isEarnings: boolean): MonthBreakdownData | null {
  const month = allocation.months.find((entry) => entry.key === monthKey);
  if (!month) return null;
  const values = isEarnings ? month.netCents : month.loggedMinutes;
  const rows = allocation.series
    .map((series) => ({ key: series.key, name: series.name, color: series.color, value: values[series.key] ?? 0 }))
    .filter((row) => row.value > 0)
    .sort((left, right) => right.value - left.value);

  return { label: month.label, rows, total: rows.reduce((total, row) => total + row.value, 0) };
}

function MonthBreakdown({ label, rows, total, isEarnings, className }: MonthBreakdownData & { isEarnings: boolean; className?: string }) {
  const format = (value: number) => isEarnings ? formatCents(value) : formatMinutes(value);

  // `box-shadow` rather than a `drop-shadow` filter on the wrapper: Recharts
  // repositions that wrapper on every mousemove, and a filter makes it a layer
  // whose alpha mask is re-rasterised each time it moves.
  return <div className={cn("min-w-44 rounded-2xl border bg-[var(--card)] p-3.5 text-sm shadow-[0_16px_32px_rgba(0,0,0,0.12)]", className)}>
    <p className="mb-2.5 text-sm font-medium text-[var(--muted-foreground)]">{label}</p>
    {rows.length
      ? <ul className="space-y-1.5">{rows.map((row) => <li key={row.key} className="flex items-center justify-between gap-4">
          <span className="flex min-w-0 items-center gap-2"><i className="size-2.5 shrink-0 rounded-full" style={{ background: row.color }} /><span className="truncate" title={row.name}>{row.name}</span></span>
          <span className="shrink-0 tabular-nums">{format(row.value)}</span>
        </li>)}</ul>
      : <p className="text-[var(--muted-foreground)]">Nothing worked this month.</p>}
    <p className="mt-2.5 flex items-center justify-between gap-4 border-t pt-2.5 font-semibold"><span>Total</span><span className="tabular-nums">{format(total)}</span></p>
  </div>;
}

type HistoryMetric = "earnings" | "hours";
const historyMetric = createLocalPreference<HistoryMetric>("shiftsentry:history-metric", "earnings", (value) => (value === "earnings" || value === "hours" ? value : null));

/** Two buttons in a track: pressed is the one showing. */
function MetricSwitch({ value, onChange }: { value: HistoryMetric; onChange: (next: HistoryMetric) => void }) {
  return <div role="group" aria-label="Show" className="inline-flex shrink-0 rounded-full bg-[var(--surface-subtle)] p-1">
    {(["earnings", "hours"] as const).map((option) => <button key={option} type="button" aria-pressed={value === option} onClick={() => onChange(option)} className={cn(
      "press min-h-11 rounded-full px-3.5 text-xs font-semibold outline-none transition-colors focus-visible:ring-4 focus-visible:ring-[var(--primary-soft)] sm:min-h-9",
      value === option ? "bg-[var(--card)] text-[var(--foreground)] shadow-[0_2px_8px_-4px_rgb(16_24_40/0.25)]" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]",
    )}>{option === "earnings" ? "Earnings" : "Hours"}</button>)}
  </div>;
}

/**
 * The last six months by job, as earnings or as hours: one chart with a
 * switch, where there used to be two identical charts a screen apart. The
 * choice is remembered per device; the first paint is earnings.
 */
function HistoryChart({ allocation }: { allocation: MonthlyJobAllocation }) {
  const metric = useSyncExternalStore(historyMetric.subscribe, historyMetric.read, historyMetric.serverSnapshot);
  const isEarnings = metric === "earnings";
  const coarsePointer = !useHoverPointer();
  const [pinnedMonthKey, setPinnedMonthKey] = useState<string | null>(null);
  const chartData = allocation.months.map((month) => ({ label: month.label, monthKey: month.key, ...(isEarnings ? month.netCents : month.loggedMinutes) }));
  const seriesKeys = allocation.series.map((series) => series.key);
  const title = "Last six months";
  const latestMonthKey = allocation.months[allocation.months.length - 1]?.key ?? null;
  // The tallest stack, so the axis can end on a round value above it.
  const stackMax = Math.max(0, ...allocation.months.map((month) => Object.values(isEarnings ? month.netCents : month.loggedMinutes).reduce((total, value) => total + value, 0)));
  const ticks = niceAxisTicks(stackMax, isEarnings ? 100 : 60);
  // Until a bar is tapped the readout shows the current month, so the panel is
  // never an empty box waiting to be earned.
  const readout = breakdownFor(allocation, pinnedMonthKey ?? latestMonthKey, isEarnings);

  function pinMonthAt(index: unknown) {
    const monthIndex = Number(index);
    const monthKey = Number.isInteger(monthIndex) ? allocation.months[monthIndex]?.key ?? null : null;
    setPinnedMonthKey((current) => current === monthKey ? null : monthKey);
  }

  return <Card className="flex h-full min-w-0 flex-col">
    <CardHeader className="shrink-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <CardTitle>{title}</CardTitle>
          <CardDescription className="mt-2">{isEarnings ? "Net pay" : "Hours worked"} by job. {coarsePointer ? "Tap" : "Hover"} a month for its breakdown.</CardDescription>
        </div>
        <MetricSwitch value={metric} onChange={historyMetric.write} />
      </div>
    </CardHeader>
    <CardContent className="flex min-h-0 flex-1 flex-col">{allocation.series.length ? <>
      {/* Each entry wraps as a unit rather than mid-name, so a legend that needs
          two lines still reads as a list of jobs. */}
      <div className="mb-4 flex flex-wrap gap-x-4 gap-y-2" aria-label={`${title} legend`}>{allocation.series.map((series) => <span key={series.key} className="flex min-w-0 max-w-full items-center gap-2 text-xs font-medium text-[var(--muted-foreground)]"><i className="size-2.5 shrink-0 rounded-full" style={{ background: series.color }} /><span className="truncate" title={series.name}>{series.name}</span></span>)}</div>
      {/* A container so the tooltip can size itself against this chart's
          width rather than the viewport's. */}
      <div className="@container relative min-h-64 flex-1">
        <div className="absolute inset-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ left: 0, right: 8, top: 16 }} onClick={coarsePointer ? (state: { activeTooltipIndex?: unknown }) => pinMonthAt(state?.activeTooltipIndex) : undefined}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
            {/* Round ticks from `niceAxisTicks` (whole hours, whole dollars), with
                the domain ending on the last one. Wide enough for a four-figure
                tick like "$1,500" in the narrow right-hand column. */}
            <YAxis width={64} ticks={ticks} domain={[0, ticks[ticks.length - 1]]} interval={0} tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} tickFormatter={(value) => isEarnings ? `$${Math.round(Number(value) / 100).toLocaleString("en-US")}` : `${Math.round(Number(value) / 60)}h`} />
            {!coarsePointer && <Tooltip
              cursor={{ fill: "color-mix(in srgb, var(--surface-subtle) 65%, transparent)", radius: 12 }}
              wrapperStyle={{ outline: "none" }}
              content={({ active, payload }) => {
                const monthKey = active ? (payload?.[0]?.payload as { monthKey?: string } | undefined)?.monthKey : undefined;
                const breakdown = breakdownFor(allocation, monthKey ?? null, isEarnings);
                // Recharts keeps the tooltip inside the plot area (the chart
                // less the 64px axis and 8px margin) by sliding it left; one
                // wider than that area gets pinned to the axis and its right
                // edge clipped. Capping it there makes long job names truncate
                // instead.
                return breakdown ? <MonthBreakdown {...breakdown} isEarnings={isEarnings} className="max-w-[calc(100cqw-4.5rem)]" /> : null;
              }}
            />}
            {allocation.series.map((series) => <Bar key={series.key} dataKey={series.key} name={series.name} stackId="allocation" fill={series.color} maxBarSize={44} isAnimationActive animationDuration={700} shape={<StackedBarShape seriesKey={series.key} seriesKeys={seriesKeys} pinnedMonthKey={coarsePointer ? pinnedMonthKey : null} />} />)}
          </BarChart>
        </ResponsiveContainer>
        </div>
      </div>
      {/* Sitting inside the card rather than floating over it, so it drops the
          tooltip's lift shadow. */}
      {coarsePointer && readout && <MonthBreakdown {...readout} isEarnings={isEarnings} className="mt-4 bg-[var(--surface-subtle)] shadow-none" />}
    </> : <p className="py-20 text-center text-sm text-[var(--muted-foreground)]">No worked shifts in this six-month period.</p>}</CardContent>
  </Card>;
}

/** The week every figure is measured in: the viewer's zone and week-start day,
 *  the same `weekStartFor` the totals use, the last day being the instant
 *  before `weekEndFor`'s midnight. */
function weekRangeLabel({ timeZone, weekStartsOn }: DashboardData["viewer"], snapshotAt: string) {
  const now = new Date(snapshotAt);
  const first = weekStartFor(now, timeZone, weekStartsOn);
  const last = new Date(weekEndFor(now, timeZone, weekStartsOn).getTime() - 1);
  const sameMonth = formatInTimeZone(first, timeZone, "yyyy-MM") === formatInTimeZone(last, timeZone, "yyyy-MM");
  return `${formatInTimeZone(first, timeZone, "MMM d")} – ${formatInTimeZone(last, timeZone, sameMonth ? "d" : "MMM d")}`;
}

/**
 * A greeting by first name in the viewer's own zone ("Good afternoon,
 * Sandeep."), then today's date there. The week's range moved into the week
 * card, beside the figures it bounds. With no name (the demo), the greeting
 * stands alone.
 */
function DashboardHeading({ data }: { data: DashboardData }) {
  const { timeZone } = data.viewer;
  const now = new Date(data.snapshotAt);
  const firstName = data.viewer.name?.trim().split(/\s+/)[0];
  const greeting = greetingForDate(now, timeZone);

  return <Reveal>
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3 sm:items-end">
      <div className="min-w-0">
        <h1 className="font-display text-2xl font-semibold tracking-[-0.025em] sm:text-[1.75rem]">{firstName ? `${greeting}, ${firstName}.` : `${greeting}.`}</h1>
        <p className="mt-1 text-xs leading-6 text-[var(--muted-foreground)]" title={`Times shown in ${timeZone}`}>{formatInTimeZone(now, timeZone, "EEEE, MMMM d")}</p>
      </div>
      {data.isDemo && <Badge variant="muted" className="mt-1.5 shrink-0 rounded-xl px-3 py-1.5 sm:mt-0">Sample data</Badge>}
    </div>
  </Reveal>;
}

const FIRST_RUN_STEPS = [
  { href: "/jobs/new", cta: "Create a job", title: "Add your first job", body: "Its pay rate, tax, and deductions are copied onto every shift you log against it, so a later raise never rewrites what you already earned." },
  { href: "/settings#week", cta: "Set your cap", title: "Set your weekly limit", body: "Confirm your time zone and the day your week starts, then set the weekly hour cap you need to stay under. Everything is measured in that zone." },
  { href: "/shifts/new", cta: "Log a shift", title: "Log a shift", body: "Past and future both count. Scheduled shifts feed the projection, so you are warned before you go over rather than after." },
];

function FirstRun() {
  return <Reveal delay={0.05}>
    <Card className="overflow-hidden border-[color-mix(in_srgb,var(--primary)_28%,var(--border))] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--primary)_12%,var(--card)),var(--card)_60%)]">
      <CardHeader>
        <CardTitle>Three steps to your first forecast</CardTitle>
        <CardDescription className="mt-2">Nothing is tracked yet. This takes about a minute.</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="grid gap-6 md:grid-cols-3 md:gap-0">
          {FIRST_RUN_STEPS.map((step, index) => {
            return <li key={step.href} className="flex flex-col md:border-l md:px-6 md:first:border-l-0 md:first:pl-0 md:last:pr-0">
              <span className="mb-2 text-sm font-semibold text-[var(--primary)]">Step {index + 1}</span>
              <p className="font-display text-lg font-semibold">{step.title}</p>
              <p className="mt-2 flex-1 text-sm leading-6 text-[var(--muted-foreground)]">{step.body}</p>
              <Link href={step.href} className={cn(buttonVariants({ size: "sm", variant: index === 0 ? "default" : "outline" }), "mt-4")}>{step.cta}<ArrowRight className="size-4" /></Link>
            </li>;
          })}
        </ol>
      </CardContent>
    </Card>
  </Reveal>;
}
