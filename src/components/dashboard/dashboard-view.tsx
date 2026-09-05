"use client";

import { useId, useMemo, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, ArrowRight, BriefcaseBusiness, CalendarClock, CheckCircle2, Clock3, Settings, Sparkles, WalletCards, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { PremiumSelect } from "@/components/ui/premium-select";
import { Progress } from "@/components/ui/progress";
import { Reveal } from "@/components/ui/reveal";
import { formatCents } from "@/lib/earnings";
import { EARNINGS_RANGE_PRESETS, monthKeyLabel, monthRangeForPreset, monthSpanLabel, selectMonths, type EarningsRangePreset } from "@/lib/earnings-range";
import { greetingForDate } from "@/lib/greeting";
import { createLocalPreference } from "@/lib/local-preference";
import { combineMonthTotals } from "@/lib/period-totals";
import { cn, formatHours, formatMinutes, splitMinutes } from "@/lib/utils";
import type { DashboardData, DashboardTotals, MonthlyJobAllocation, ThresholdAlert } from "@/lib/types";

function capPercent(used: number, limit: number | null) {
  return limit ? Math.round((used / limit) * 100) : 0;
}

const PROJECTIONS_DISMISSED_KEY = "shiftsentry:projections-explainer-dismissed";
const dismissalListeners = new Set<() => void>();

function readDismissed() {
  try { return window.localStorage.getItem(PROJECTIONS_DISMISSED_KEY) === "1"; } catch { return false; }
}

function subscribeToDismissal(listener: () => void) {
  dismissalListeners.add(listener);
  return () => { dismissalListeners.delete(listener); };
}

function dismissProjectionsExplainer() {
  // A blocked store only means the card returns next visit.
  try { window.localStorage.setItem(PROJECTIONS_DISMISSED_KEY, "1"); } catch { /* ignore */ }
  for (const listener of dismissalListeners) listener();
}

/**
 * Whether to show the projections explainer, and how to put it away.
 *
 * localStorage cannot be read while the server renders, so the server snapshot
 * says "not dismissed" and the real value arrives on the first client render.
 * A viewer who dismissed it may see it for one frame; the card sits low on the
 * page, and the alternative -- withholding it from first-time viewers until
 * hydration -- gets the more important case wrong.
 */
function useProjectionsExplainer(): [boolean, () => void] {
  const dismissed = useSyncExternalStore(subscribeToDismissal, readDismissed, () => false);
  return [!dismissed, dismissProjectionsExplainer];
}

const COARSE_POINTER_QUERY = "(pointer: coarse)";

function subscribeToPointer(listener: () => void) {
  const query = window.matchMedia(COARSE_POINTER_QUERY);
  query.addEventListener("change", listener);
  return () => query.removeEventListener("change", listener);
}

function readCoarsePointer() {
  return window.matchMedia(COARSE_POINTER_QUERY).matches;
}

/**
 * Touch has no hover, so a floating tooltip appears under the finger that
 * summoned it and vanishes the moment the finger lifts. Coarse pointers get a
 * pinned readout below the chart instead; the server snapshot assumes a mouse.
 */
function useCoarsePointer() {
  return useSyncExternalStore(subscribeToPointer, readCoarsePointer, () => false);
}

/** Beyond this many, cap warnings stack past the fold and stop being read. */
const ALERT_PREVIEW_COUNT = 2;

function CapAlerts({ alerts }: { alerts: ThresholdAlert[] }) {
  const [expanded, setExpanded] = useState(false);
  // Most urgent first, so a cap already reached is never pushed below one at 80%.
  const ordered = useMemo(() => [...alerts].sort((a, b) => b.level - a.level), [alerts]);
  const visible = expanded ? ordered : ordered.slice(0, ALERT_PREVIEW_COUNT);
  const hidden = ordered.length - visible.length;

  return <>
    {visible.map((alert, index) => {
      // Severity picks the token: a cap already reached used to render in the
      // same amber as one merely approaching.
      const tone = alert.severity === "danger" ? "var(--danger)" : "var(--warning)";
      return <Reveal key={`${alert.title}-${alert.level}`} delay={0.08 + index * 0.04}>
        <div className="mb-4 flex items-start gap-3 rounded-2xl border p-4 shadow-sm" style={{ borderColor: `color-mix(in srgb, ${tone} 35%, var(--border))`, background: `color-mix(in srgb, ${tone} 9%, transparent)` }}>
          <span className="grid size-9 shrink-0 place-items-center rounded-xl" style={{ background: `color-mix(in srgb, ${tone} 18%, transparent)` }}><AlertTriangle className="size-5" style={{ color: tone }} /></span>
          <div><p className="font-semibold">{alert.title}</p><p className="mt-0.5 text-sm leading-6 text-[var(--muted-foreground)]">{alert.detail}</p></div>
        </div>
      </Reveal>;
    })}
    {hidden > 0 && <button type="button" onClick={() => setExpanded(true)} className="mb-4 w-full rounded-2xl border border-dashed px-4 py-2.5 text-sm font-semibold text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-subtle)] hover:text-[var(--foreground)]">Show {hidden} more cap warning{hidden === 1 ? "" : "s"}</button>}
  </>;
}

export function DashboardView({ data }: { data: DashboardData }) {
  const [showProjections, dismissProjections] = useProjectionsExplainer();
  const projected = data.loggedMinutes + data.scheduledMinutes;
  // Hours large, leftover minutes small: the hero keeps its typography without
  // rounding a minute away, which at a cap boundary reads as "exactly at the
  // limit" when the viewer is actually over it.
  const projectedParts = splitMinutes(projected);
  const globalPercent = capPercent(projected, data.globalLimitMinutes);
  const remaining = data.globalLimitMinutes === null ? null : Math.max(0, data.globalLimitMinutes - projected);
  const capVariant = globalPercent >= 100 ? "danger" : globalPercent >= 80 ? "warning" : "success";
  const capColor = globalPercent >= 100 ? "bg-[var(--danger)]" : globalPercent >= 80 ? "bg-[var(--warning)]" : "bg-[var(--success)]";

  // Nothing has been set up yet, so there is nothing to total. The full
  // dashboard here is a wall of zeros -- an empty hero, four $0.00 metrics, two
  // blank charts and three separate empty states -- which says what is missing
  // without saying what to do about it.
  if (!data.isDemo && data.jobs.length === 0) return <><DashboardGreeting data={data} /><FirstRun /></>;

  return <>
    <DashboardGreeting data={data} />

    <Reveal delay={0.05}>
      <Card className="relative mb-6 overflow-hidden border-[color-mix(in_srgb,var(--primary)_28%,var(--border))] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--primary)_15%,var(--card)),var(--card)_58%)]">
        <div className="pointer-events-none absolute -right-24 -top-28 size-72 rounded-full bg-[var(--primary)]/15 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-1/3 size-52 rounded-full bg-[var(--primary)]/10 blur-3xl" />
        <CardContent className="relative grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
          <div>
            <div className="mb-4 flex items-center justify-between gap-3">
              <div><p className="text-sm font-semibold">Global weekly cap</p><p className="mt-1 text-sm text-[var(--muted-foreground)]">Logged plus scheduled hours, all in one view.</p></div>
              <Badge variant={capVariant} className="rounded-xl px-3 py-1.5">{data.globalLimitMinutes ? `${globalPercent}% planned` : "No cap"}</Badge>
            </div>
            <div className="mb-4 flex items-baseline gap-2"><span className="font-display text-5xl font-semibold sm:text-6xl">{projectedParts.hours}<span className="ml-1 text-2xl text-[var(--muted-foreground)] sm:text-3xl">h{projectedParts.minutes ? ` ${projectedParts.minutes}m` : ""}</span></span><span className="text-sm text-[var(--muted-foreground)]">of {data.globalLimitMinutes ? formatMinutes(data.globalLimitMinutes) : "unlimited"}</span></div>
            <Progress value={globalPercent} indicatorClassName={capColor} />
            <div className="mt-3 flex justify-between text-xs font-medium text-[var(--muted-foreground)]"><span>{formatMinutes(data.loggedMinutes)} logged</span><span>{formatMinutes(data.scheduledMinutes)} scheduled</span></div>
          </div>
          {/* No `backdrop-blur` on these two, for the reason card.tsx gives: it
              is among the most expensive things to composite, and here it bought
              nothing -- the only thing behind them is the card gradient and two
              already-blurred glows, so it was blurring a blur. */}
          <div className="grid grid-cols-2 gap-3 lg:min-w-64">
            <div className="rounded-2xl border border-white/10 bg-[var(--card)]/55 p-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Remaining</p><p className="mt-2 font-display text-2xl font-semibold">{remaining === null ? "—" : formatMinutes(remaining)}</p></div>
            <div className="rounded-2xl border border-white/10 bg-[var(--card)]/55 p-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Upcoming</p><p className="mt-2 font-display text-2xl font-semibold">{data.upcomingShifts.length}</p></div>
          </div>
        </CardContent>
      </Card>
    </Reveal>

    <CapAlerts alerts={data.alerts} />

    <section className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
      <Reveal><EarningsCard totals={data.totals} /></Reveal>
      <Reveal delay={0.06}><MonthlyAllocationChart allocation={data.monthlyJobAllocation} metric="earnings" /></Reveal>
    </section>

    <section className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]">
      <Reveal><MonthlyAllocationChart allocation={data.monthlyJobAllocation} metric="hours" /></Reveal>
      <Reveal delay={0.06}><Card className="h-full hover:-translate-y-0.5"><CardHeader><CardTitle>Hours by job</CardTitle><CardDescription>Includes future shifts in this week.</CardDescription></CardHeader><CardContent className="space-y-5">{data.jobs.length ? data.jobs.map((job) => <JobLimit key={job.id} job={job} />) : <EmptyState message="Add a job to start tracking its limit." href="/jobs" cta="Create your first job" />}</CardContent></Card></Reveal>
    </section>

    <section className={cn("mt-6 grid grid-cols-1 gap-6", showProjections && "xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.8fr)]")}>
      <Reveal><Card className="h-full hover:-translate-y-0.5"><CardHeader><div className="flex items-center justify-between gap-3"><div><CardTitle>Coming up</CardTitle><CardDescription>Your next scheduled shifts</CardDescription></div><Link href="/shifts" className="inline-flex min-h-11 items-center rounded-xl px-3 py-2 text-sm font-semibold text-[var(--primary)] sm:min-h-0 transition-colors hover:bg-[var(--primary-soft)]">See all</Link></div></CardHeader><CardContent className="space-y-1">{data.upcomingShifts.length ? data.upcomingShifts.map((shift) => <Link key={shift.id} href={`/shifts/${shift.id}/edit`} className="flex items-center gap-3 rounded-2xl p-2.5 transition-colors hover:bg-[var(--surface-subtle)]"><span className="grid size-10 place-items-center rounded-xl" style={{ background: `${shift.jobColor}22`, color: shift.jobColor }}><Clock3 className="size-4" /></span><div className="min-w-0 flex-1"><p className="font-semibold">{shift.jobName}</p><p className="truncate text-sm text-[var(--muted-foreground)]">{formatInTimeZone(shift.startsAt, data.viewer.timeZone, "EEE, MMM d · h:mm a")} – {formatInTimeZone(shift.endsAt, data.viewer.timeZone, "h:mm a")}</p></div><ArrowRight className="size-4 text-[var(--muted-foreground)]" /></Link>) : <EmptyState message="Nothing scheduled this week." href="/shifts/new" cta="Schedule your first shift" />}</CardContent></Card></Reveal>
      {showProjections && <Reveal delay={0.06}><Card className="h-full hover:-translate-y-0.5"><CardHeader><div className="flex items-start justify-between gap-3"><div><CardTitle>How projections work</CardTitle><CardDescription>Stay ahead instead of reacting late.</CardDescription></div><button type="button" onClick={dismissProjections} aria-label="Hide this explainer" className="-mr-1 -mt-1 grid size-11 shrink-0 place-items-center rounded-xl sm:size-8 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-subtle)] hover:text-[var(--foreground)]"><X className="size-4" /></button></div></CardHeader><CardContent className="space-y-2 text-sm"><ProjectionStep icon={CheckCircle2} color="var(--success)">Past and current shifts count as logged time.</ProjectionStep><ProjectionStep icon={CalendarClock} color="var(--primary)">Future shifts are included in your projected total.</ProjectionStep><ProjectionStep icon={AlertTriangle} color="var(--warning)">We alert you at 80%, 90%, and 100%.</ProjectionStep></CardContent></Card></Reveal>}
    </section>
  </>;
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

function EarningsCard({ totals }: { totals: DashboardTotals }) {
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

  const description = preset === "week" ? "Completed work plus time elapsed on any active shift."
    : !span ? "Nothing has been logged yet."
    : span.from === span.to ? `Everything you worked in ${monthKeyLabel(span.from)}.`
    : `Everything you worked from ${monthKeyLabel(span.from)} to ${monthKeyLabel(span.to)}.`;

  const monthOptions = months.map((month) => ({ value: month.key, label: month.label }));

  function choosePreset(next: EarningsRangePreset) {
    // Opening the custom picker on a blank pair would show zeros; it starts on
    // the last three months, which is the span most people narrow from.
    setRange({ preset: next, custom: next === "custom" ? custom ?? monthRangeForPreset("last3", months) : custom });
  }

  return <Card className="h-full hover:-translate-y-0.5">
    <CardHeader>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <CardTitle className="flex items-center gap-2.5"><span className="grid size-8 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--success)_13%,transparent)]"><WalletCards className="size-4 text-[var(--success)]" /></span>Earnings</CardTitle>
          <CardDescription className="mt-2">{description}</CardDescription>
        </div>
        <div className="w-full sm:w-56 sm:shrink-0">
          <span id={`${pickerId}-range`} className="sr-only">Earnings period</span>
          <PremiumSelect key={hydrated ? "hydrated" : "initial"} name="earnings-range" labelledBy={`${pickerId}-range`} defaultValue={preset} options={rangeOptions} onValueChange={(value) => choosePreset(value as EarningsRangePreset)} />
        </div>
      </div>
    </CardHeader>
    <CardContent>
      {preset === "custom" && custom && <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <div>
          <p id={`${pickerId}-from`} className="mb-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">From</p>
          <PremiumSelect name="earnings-range-from" labelledBy={`${pickerId}-from`} defaultValue={custom.from} options={monthOptions} onValueChange={(value) => setRange({ preset, custom: { from: value, to: custom.to } })} />
        </div>
        <div>
          <p id={`${pickerId}-to`} className="mb-1.5 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">To</p>
          <PremiumSelect name="earnings-range-to" labelledBy={`${pickerId}-to`} defaultValue={custom.to} options={monthOptions} onValueChange={(value) => setRange({ preset, custom: { from: custom.from, to: value } })} />
        </div>
      </div>}
      {/* Net and hours are the answer; gross, tax and deductions explain it. Equal
          tiles for all five made the two numbers anyone actually came for
          indistinguishable from their own footnotes. */}
      <div className="grid grid-cols-2 gap-3">
        <Headline label="Net earned" value={formatCents(summary.earnings.netCents)} success />
        <Headline label="Hours worked" value={formatMinutes(summary.minutes)} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-3">
        <Metric label="Gross" value={formatCents(summary.earnings.grossCents)} />
        <Metric label="Tax" value={withheld(summary.earnings.taxCents)} />
        <Metric label="Deductions" value={withheld(summary.earnings.deductionCents)} />
      </div>
      <div className="mt-5 space-y-1.5">
        {summary.jobs.length
          ? summary.jobs.map((job) => <div key={job.id} className="flex items-center justify-between gap-3 rounded-xl px-2.5 py-2 text-sm transition-colors hover:bg-[var(--surface-subtle)]"><span className="flex min-w-0 items-center gap-2.5 font-medium"><i className="size-2.5 shrink-0 rounded-full shadow-sm" style={{ background: job.color }} /><span className="truncate" title={job.name}>{job.name}</span></span><span className="shrink-0 font-semibold">{formatCents(job.netCents)}</span></div>)
          : <p className="rounded-xl px-2.5 py-2 text-sm text-[var(--muted-foreground)]">No worked shifts in this period.</p>}
      </div>
    </CardContent>
  </Card>;
}

function EmptyState({ message, href, cta }: { message: string; href: string; cta: string }) {
  return <div className="rounded-2xl border border-dashed px-5 py-8 text-center"><p className="text-sm leading-6 text-[var(--muted-foreground)]">{message}</p><Link href={href} className={cn(buttonVariants({ size: "sm" }), "mt-4")}>{cta}</Link></div>;
}

function Headline({ label, value, success = false }: { label: string; value: string; success?: boolean }) {
  return <div className={cn("rounded-2xl border p-3.5 sm:p-4", success ? "border-[color-mix(in_srgb,var(--success)_20%,var(--border))] bg-[color-mix(in_srgb,var(--success)_10%,transparent)]" : "bg-[var(--surface-subtle)]")}>
    <p className="text-xs font-medium text-[var(--muted-foreground)]">{label}</p>
    <p className={cn("mt-1.5 font-display text-2xl font-semibold tabular-nums sm:text-[1.75rem]", success && "text-[var(--success)]")}>{value}</p>
  </div>;
}

// The value never wraps: an all-time figure broke across lines at 390px and left
// the minus sign stranded above the amount, which reads as a positive number.
function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-2xl border bg-[var(--surface-subtle)] p-3.5"><p className="text-xs font-medium text-[var(--muted-foreground)]">{label}</p><p className="mt-1.5 whitespace-nowrap font-display text-base font-semibold tabular-nums sm:text-lg">{value}</p></div>;
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
    <p className="mb-2.5 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">{label}</p>
    {rows.length
      ? <ul className="space-y-1.5">{rows.map((row) => <li key={row.key} className="flex items-center justify-between gap-4">
          <span className="flex min-w-0 items-center gap-2"><i className="size-2.5 shrink-0 rounded-full" style={{ background: row.color }} /><span className="truncate" title={row.name}>{row.name}</span></span>
          <span className="shrink-0 tabular-nums">{format(row.value)}</span>
        </li>)}</ul>
      : <p className="text-[var(--muted-foreground)]">Nothing worked this month.</p>}
    <p className="mt-2.5 flex items-center justify-between gap-4 border-t pt-2.5 font-semibold"><span>Total</span><span className="tabular-nums">{format(total)}</span></p>
  </div>;
}

function MonthlyAllocationChart({ allocation, metric }: { allocation: MonthlyJobAllocation; metric: "earnings" | "hours" }) {
  const isEarnings = metric === "earnings";
  const coarsePointer = useCoarsePointer();
  const [pinnedMonthKey, setPinnedMonthKey] = useState<string | null>(null);
  const chartData = allocation.months.map((month) => ({ label: month.label, monthKey: month.key, ...(isEarnings ? month.netCents : month.loggedMinutes) }));
  const seriesKeys = allocation.series.map((series) => series.key);
  const title = isEarnings ? "Net earnings by job" : "Logged hours by job";
  const latestMonthKey = allocation.months[allocation.months.length - 1]?.key ?? null;
  // Until a bar is tapped the readout shows the current month, so the panel is
  // never an empty box waiting to be earned.
  const readout = breakdownFor(allocation, pinnedMonthKey ?? latestMonthKey, isEarnings);

  function pinMonthAt(index: unknown) {
    const monthIndex = Number(index);
    const monthKey = Number.isInteger(monthIndex) ? allocation.months[monthIndex]?.key ?? null : null;
    setPinnedMonthKey((current) => current === monthKey ? null : monthKey);
  }

  return <Card className="h-full hover:-translate-y-0.5">
    <CardHeader><CardTitle>{title}</CardTitle><CardDescription>Actual monthly allocation for the last six months. {coarsePointer ? "Tap a month for its breakdown." : "Hover a month for its breakdown."}</CardDescription></CardHeader>
    <CardContent>{allocation.series.length ? <>
      {/* Each entry wraps as a unit rather than mid-name, so a legend that needs
          two lines still reads as a list of jobs. */}
      <div className="mb-4 flex flex-wrap gap-x-4 gap-y-2" aria-label={`${title} legend`}>{allocation.series.map((series) => <span key={series.key} className="flex items-center gap-2 whitespace-nowrap text-xs font-medium text-[var(--muted-foreground)]"><i className="size-2.5 shrink-0 rounded-full" style={{ background: series.color }} />{series.name}</span>)}</div>
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} margin={{ left: 0, right: 8, top: 4 }} onClick={coarsePointer ? (state: { activeTooltipIndex?: unknown }) => pinMonthAt(state?.activeTooltipIndex) : undefined}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} />
            {/* Wide enough for a four-figure tick. At the previous width "$200"
                cleared the left edge by eight pixels, so a month over $999 --
                or the hours axis reading "26.7h" -- was one character from
                being cut off in the narrow right-hand column. */}
            <YAxis width={64} tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} tickFormatter={(value) => isEarnings ? `$${Math.round(Number(value) / 100)}` : `${formatHours(Number(value))}h`} />
            {!coarsePointer && <Tooltip
              cursor={{ fill: "color-mix(in srgb, var(--surface-subtle) 65%, transparent)", radius: 12 }}
              wrapperStyle={{ outline: "none" }}
              content={({ active, payload }) => {
                const monthKey = active ? (payload?.[0]?.payload as { monthKey?: string } | undefined)?.monthKey : undefined;
                const breakdown = breakdownFor(allocation, monthKey ?? null, isEarnings);
                return breakdown ? <MonthBreakdown {...breakdown} isEarnings={isEarnings} /> : null;
              }}
            />}
            {allocation.series.map((series) => <Bar key={series.key} dataKey={series.key} name={series.name} stackId="allocation" fill={series.color} maxBarSize={44} animationDuration={700} shape={<StackedBarShape seriesKey={series.key} seriesKeys={seriesKeys} pinnedMonthKey={coarsePointer ? pinnedMonthKey : null} />} />)}
          </BarChart>
        </ResponsiveContainer>
      </div>
      {/* Sitting inside the card rather than floating over it, so it drops the
          tooltip's lift shadow. */}
      {coarsePointer && readout && <MonthBreakdown {...readout} isEarnings={isEarnings} className="mt-4 bg-[var(--surface-subtle)] shadow-none" />}
    </> : <p className="py-20 text-center text-sm text-[var(--muted-foreground)]">No worked shifts in this six-month period.</p>}</CardContent>
  </Card>;
}

function JobLimit({ job }: { job: DashboardData["jobs"][number] }) {
  const planned = job.usedMinutes + job.scheduledMinutes;
  const percent = capPercent(planned, job.weeklyLimitMinutes);
  const indicatorClassName = percent >= 100 ? "bg-[var(--danger)]" : percent >= 80 ? "bg-[var(--warning)]" : undefined;

  // One line each. This card sits in the narrow column, where a name like
  // "Multimedia Streaming Technician" wrapped to two lines and then broke the
  // figure beside it across two more -- "5h" above "45m", which reads as two
  // numbers rather than one duration. The name truncates and carries its full
  // text in a tooltip; the duration never breaks.
  return <div className="rounded-2xl p-1.5 transition-colors hover:bg-[var(--surface-subtle)]">
    <div className="mb-2.5 flex items-center justify-between gap-3 px-1 text-sm">
      <span className="flex min-w-0 items-center gap-2.5 font-semibold">
        <i className="size-2.5 shrink-0 rounded-full" style={{ background: job.color }} />
        <span className="truncate" title={job.name}>{job.name}</span>
      </span>
      <span className="shrink-0 whitespace-nowrap tabular-nums text-[var(--muted-foreground)]">{formatMinutes(planned)}{job.weeklyLimitMinutes ? ` / ${formatMinutes(job.weeklyLimitMinutes)}` : ""}</span>
    </div>
    <Progress value={percent} indicatorClassName={indicatorClassName} />
  </div>;
}

function ProjectionStep({ icon: Icon, color, children }: { icon: typeof CheckCircle2; color: string; children: string }) {
  return <p className="flex gap-3 rounded-2xl p-2.5 leading-6 transition-colors hover:bg-[var(--surface-subtle)]"><span className="grid size-8 shrink-0 place-items-center rounded-xl bg-[var(--surface-subtle)]"><Icon className="size-4" style={{ color }} /></span><span>{children}</span></p>;
}

function DashboardGreeting({ data }: { data: DashboardData }) {
  return <Reveal>
    <div className="mb-7 flex flex-col justify-between gap-4 sm:mb-8 sm:flex-row sm:items-end">
      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-[var(--primary)]">{data.isDemo ? "Workspace preview" : "Weekly overview"}</p>
        <h1 className="font-display text-3xl font-semibold sm:text-4xl">{greetingForDate(new Date(), data.viewer.timeZone)}, {data.viewer.name ?? "there"}.</h1>
        <p className="mt-2.5 text-sm leading-6 text-[var(--muted-foreground)]">Your week starts on {new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(new Date(2026, 7, 16 + data.viewer.weekStartsOn))} in {data.viewer.timeZone}.</p>
      </div>
      {data.isDemo && <Badge variant="muted" className="rounded-xl px-3 py-1.5"><Sparkles className="mr-1.5 size-3.5" />Sample data</Badge>}
    </div>
  </Reveal>;
}

const FIRST_RUN_STEPS = [
  { icon: BriefcaseBusiness, href: "/jobs", cta: "Create a job", title: "Add your first job", body: "Its pay rate, tax, and deductions are copied onto every shift you log against it, so a later raise never rewrites what you already earned." },
  { icon: Settings, href: "/settings", cta: "Set your cap", title: "Set your weekly limit", body: "Confirm your time zone and the day your week starts, then set the weekly hour cap you need to stay under. Everything is measured in that zone." },
  { icon: CalendarClock, href: "/shifts/new", cta: "Log a shift", title: "Log a shift", body: "Past and future both count. Scheduled shifts feed the projection, so you are warned before you go over rather than after." },
];

function FirstRun() {
  return <Reveal delay={0.05}>
    <Card className="overflow-hidden border-[color-mix(in_srgb,var(--primary)_28%,var(--border))] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--primary)_12%,var(--card)),var(--card)_60%)]">
      <CardHeader>
        <CardTitle className="flex items-center gap-2.5"><span className="grid size-8 place-items-center rounded-xl bg-[var(--primary-soft)]"><Sparkles className="size-4 text-[var(--primary)]" /></span>Three steps to your first forecast</CardTitle>
        <CardDescription className="mt-2">Nothing is tracked yet. This takes about a minute.</CardDescription>
      </CardHeader>
      <CardContent>
        <ol className="grid gap-3 md:grid-cols-3">
          {FIRST_RUN_STEPS.map((step, index) => {
            const Icon = step.icon;
            return <li key={step.href} className="flex flex-col rounded-2xl border bg-[var(--card)]/60 p-5">
              <span className="mb-3 flex items-center gap-2.5">
                <span className="grid size-8 shrink-0 place-items-center rounded-xl bg-[var(--primary)] text-sm font-bold text-[var(--primary-foreground)]">{index + 1}</span>
                <Icon className="size-4 text-[var(--muted-foreground)]" />
              </span>
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
