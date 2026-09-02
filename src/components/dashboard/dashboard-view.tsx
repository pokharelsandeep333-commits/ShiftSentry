"use client";

import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AlertTriangle, ArrowRight, CalendarClock, CheckCircle2, Clock3, Sparkles, WalletCards } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Reveal } from "@/components/ui/reveal";
import { formatCents } from "@/lib/earnings";
import { greetingForDate } from "@/lib/greeting";
import { formatHours, formatMinutes } from "@/lib/utils";
import type { DashboardData } from "@/lib/types";

function capPercent(used: number, limit: number | null) {
  return limit ? Math.round((used / limit) * 100) : 0;
}

const chartTooltip = {
  backgroundColor: "var(--card)",
  borderColor: "var(--border)",
  borderRadius: "16px",
  color: "var(--foreground)",
  boxShadow: "0 16px 32px rgba(0,0,0,0.12)",
};

export function DashboardView({ data }: { data: DashboardData }) {
  const projected = data.loggedMinutes + data.scheduledMinutes;
  const globalPercent = capPercent(projected, data.globalLimitMinutes);
  const remaining = data.globalLimitMinutes === null ? null : Math.max(0, data.globalLimitMinutes - projected);
  const capVariant = globalPercent >= 100 ? "danger" : globalPercent >= 80 ? "warning" : "success";
  const capColor = globalPercent >= 100 ? "bg-[var(--danger)]" : globalPercent >= 80 ? "bg-[var(--warning)]" : "bg-[var(--success)]";

  return <>
    <Reveal>
      <div className="mb-7 flex flex-col justify-between gap-4 sm:mb-8 sm:flex-row sm:items-end">
        <div>
          <p className="mb-2 text-xs font-bold uppercase tracking-[0.16em] text-[var(--primary)]">{data.isDemo ? "Workspace preview" : "Weekly overview"}</p>
          <h1 className="font-display text-3xl font-semibold sm:text-4xl">{greetingForDate(new Date(), data.viewer.timeZone)}, {data.viewer.name ?? "there"}.</h1>
          <p className="mt-2.5 text-sm leading-6 text-[var(--muted-foreground)]">Your week starts on {new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(new Date(2026, 7, 16 + data.viewer.weekStartsOn))} in {data.viewer.timeZone}.</p>
        </div>
        {data.isDemo && <Badge variant="muted" className="rounded-xl px-3 py-1.5"><Sparkles className="mr-1.5 size-3.5" />Sample data</Badge>}
      </div>
    </Reveal>

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
            <div className="mb-4 flex items-baseline gap-2"><span className="font-display text-5xl font-semibold sm:text-6xl">{formatHours(projected)}<span className="ml-1 text-2xl text-[var(--muted-foreground)] sm:text-3xl">h</span></span><span className="text-sm text-[var(--muted-foreground)]">of {data.globalLimitMinutes ? `${formatHours(data.globalLimitMinutes)}h` : "unlimited"}</span></div>
            <Progress value={globalPercent} indicatorClassName={capColor} />
            <div className="mt-3 flex justify-between text-xs font-medium text-[var(--muted-foreground)]"><span>{formatMinutes(data.loggedMinutes)} logged</span><span>{formatMinutes(data.scheduledMinutes)} scheduled</span></div>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:min-w-64">
            <div className="rounded-2xl border border-white/10 bg-[var(--card)]/55 p-4 backdrop-blur"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Remaining</p><p className="mt-2 font-display text-2xl font-semibold">{remaining === null ? "—" : `${formatHours(remaining)}h`}</p></div>
            <div className="rounded-2xl border border-white/10 bg-[var(--card)]/55 p-4 backdrop-blur"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Upcoming</p><p className="mt-2 font-display text-2xl font-semibold">{data.upcomingShifts.length}</p></div>
          </div>
        </CardContent>
      </Card>
    </Reveal>

    {data.alerts.map((alert, index) => <Reveal key={`${alert.title}-${alert.level}`} delay={0.08 + index * 0.04}>
      <div className="mb-4 flex items-start gap-3 rounded-2xl border border-[color-mix(in_srgb,var(--warning)_35%,var(--border))] bg-[color-mix(in_srgb,var(--warning)_9%,transparent)] p-4 shadow-sm">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--warning)_18%,transparent)]"><AlertTriangle className="size-5 text-[var(--warning)]" /></span>
        <div><p className="font-semibold">{alert.title}</p><p className="mt-0.5 text-sm leading-6 text-[var(--muted-foreground)]">{alert.detail}</p></div>
      </div>
    </Reveal>)}

    <section className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
      <Reveal><Card className="h-full hover:-translate-y-0.5"><CardHeader><div className="flex items-center justify-between gap-4"><div><CardTitle className="flex items-center gap-2.5"><span className="grid size-8 place-items-center rounded-xl bg-[color-mix(in_srgb,var(--success)_13%,transparent)]"><WalletCards className="size-4 text-[var(--success)]" /></span>Earned this week</CardTitle><CardDescription className="mt-2">Completed work plus time elapsed on any active shift.</CardDescription></div><Badge variant="success" className="rounded-xl">Net {formatCents(data.earnings.netCents)}</Badge></div></CardHeader><CardContent><div className="grid gap-3 sm:grid-cols-4"><Metric label="Gross" value={formatCents(data.earnings.grossCents)} /><Metric label="Tax" value={`−${formatCents(data.earnings.taxCents)}`} /><Metric label="Deductions" value={`−${formatCents(data.earnings.deductionCents)}`} /><Metric label="Net earned" value={formatCents(data.earnings.netCents)} success /></div><div className="mt-5 space-y-1.5">{data.jobs.map((job) => <div key={job.id} className="flex items-center justify-between rounded-xl px-2.5 py-2 text-sm transition-colors hover:bg-[var(--surface-subtle)]"><span className="flex items-center gap-2.5 font-medium"><i className="size-2.5 rounded-full shadow-sm" style={{ background: job.color }} />{job.name}</span><span className="font-semibold">{formatCents(job.earnedNetCents)}</span></div>)}</div></CardContent></Card></Reveal>
      <Reveal delay={0.06}><MonthlyAllocationChart allocation={data.monthlyJobAllocation} metric="earnings" /></Reveal>
    </section>

    <section className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
      <Reveal><MonthlyAllocationChart allocation={data.monthlyJobAllocation} metric="hours" /></Reveal>
      <Reveal delay={0.06}><Card className="h-full hover:-translate-y-0.5"><CardHeader><CardTitle>Hours by job</CardTitle><CardDescription>Includes future shifts in this week.</CardDescription></CardHeader><CardContent className="space-y-5">{data.jobs.length ? data.jobs.map((job) => <JobLimit key={job.id} job={job} />) : <EmptyState message="Add a job to start tracking its limit." href="/jobs" cta="Create your first job" />}</CardContent></Card></Reveal>
    </section>

    <section className="mt-6 grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
      <Reveal><Card className="h-full hover:-translate-y-0.5"><CardHeader><div className="flex items-center justify-between gap-3"><div><CardTitle>Coming up</CardTitle><CardDescription>Your next scheduled shifts</CardDescription></div><Link href="/shifts" className="rounded-xl px-3 py-2 text-sm font-semibold text-[var(--primary)] transition-colors hover:bg-[var(--primary-soft)]">See all</Link></div></CardHeader><CardContent className="space-y-1">{data.upcomingShifts.length ? data.upcomingShifts.map((shift) => <Link key={shift.id} href={`/shifts/${shift.id}/edit`} className="flex items-center gap-3 rounded-2xl p-2.5 transition-colors hover:bg-[var(--surface-subtle)]"><span className="grid size-10 place-items-center rounded-xl" style={{ background: `${shift.jobColor}22`, color: shift.jobColor }}><Clock3 className="size-4" /></span><div className="min-w-0 flex-1"><p className="font-semibold">{shift.jobName}</p><p className="truncate text-sm text-[var(--muted-foreground)]">{formatInTimeZone(shift.startsAt, data.viewer.timeZone, "EEE, MMM d · h:mm a")} – {formatInTimeZone(shift.endsAt, data.viewer.timeZone, "h:mm a")}</p></div><ArrowRight className="size-4 text-[var(--muted-foreground)]" /></Link>) : <EmptyState message="Nothing scheduled this week." href="/shifts/new" cta="Schedule your first shift" />}</CardContent></Card></Reveal>
      <Reveal delay={0.06}><Card className="h-full hover:-translate-y-0.5"><CardHeader><CardTitle>How projections work</CardTitle><CardDescription>Stay ahead instead of reacting late.</CardDescription></CardHeader><CardContent className="space-y-2 text-sm"><ProjectionStep icon={CheckCircle2} color="var(--success)">Past and current shifts count as logged time.</ProjectionStep><ProjectionStep icon={CalendarClock} color="var(--primary)">Future shifts are included in your projected total.</ProjectionStep><ProjectionStep icon={AlertTriangle} color="var(--warning)">We alert you at 80%, 90%, and 100%.</ProjectionStep></CardContent></Card></Reveal>
    </section>
  </>;
}

function EmptyState({ message, href, cta }: { message: string; href: string; cta: string }) {
  return <div className="rounded-2xl border border-dashed px-5 py-8 text-center"><p className="text-sm leading-6 text-[var(--muted-foreground)]">{message}</p><Link href={href} className="mt-4 inline-block"><Button size="sm">{cta}</Button></Link></div>;
}

function Metric({ label, value, success = false }: { label: string; value: string; success?: boolean }) {
  return <div className={success ? "rounded-2xl border border-[color-mix(in_srgb,var(--success)_20%,var(--border))] bg-[color-mix(in_srgb,var(--success)_10%,transparent)] p-3.5" : "rounded-2xl border bg-[var(--surface-subtle)] p-3.5"}><p className="text-xs font-medium text-[var(--muted-foreground)]">{label}</p><p className={success ? "mt-1.5 font-display text-lg font-semibold text-[var(--success)]" : "mt-1.5 font-display text-lg font-semibold"}>{value}</p></div>;
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

function StackedBarShape({ seriesKey, seriesKeys = [], payload = {}, x = 0, y = 0, width = 0, height = 0, fill }: {
  seriesKey?: string;
  seriesKeys?: string[];
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
  if (!radius) return <rect x={x} y={y} width={width} height={height} fill={fill} />;

  return <path fill={fill} d={`M${x},${y + height} L${x},${y + radius} Q${x},${y} ${x + radius},${y} L${x + width - radius},${y} Q${x + width},${y} ${x + width},${y + radius} L${x + width},${y + height} Z`} />;
}

function MonthlyAllocationChart({ allocation, metric }: { allocation: DashboardData["monthlyJobAllocation"]; metric: "earnings" | "hours" }) {
  const isEarnings = metric === "earnings";
  const chartData = allocation.months.map((month) => ({ label: month.label, ...(isEarnings ? month.netCents : month.loggedMinutes) }));
  const seriesKeys = allocation.series.map((series) => series.key);
  const title = isEarnings ? "Net earnings by job" : "Logged hours by job";
  const description = "Actual monthly allocation for the last six months.";

  return <Card className="h-full hover:-translate-y-0.5"><CardHeader><CardTitle>{title}</CardTitle><CardDescription>{description}</CardDescription></CardHeader><CardContent>{allocation.series.length ? <><div className="mb-4 flex flex-wrap gap-x-4 gap-y-2" aria-label={`${title} legend`}>{allocation.series.map((series) => <span key={series.key} className="flex items-center gap-2 text-xs font-medium text-[var(--muted-foreground)]"><i className="size-2.5 rounded-full" style={{ background: series.color }} />{series.name}</span>)}</div><div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData} margin={{ left: -14, right: 8, top: 4 }}><CartesianGrid vertical={false} stroke="var(--border)" /><XAxis dataKey="label" tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} /><YAxis tickLine={false} axisLine={false} tick={{ fill: "var(--muted-foreground)", fontSize: 12 }} tickFormatter={(value) => isEarnings ? `$${Math.round(Number(value) / 100)}` : `${formatHours(Number(value))}h`} /><Tooltip cursor={{ fill: "color-mix(in srgb, var(--surface-subtle) 65%, transparent)", radius: 12 }} formatter={(value, name) => [isEarnings ? formatCents(Number(value)) : formatMinutes(Number(value)), name]} contentStyle={chartTooltip} itemStyle={{ color: "var(--foreground)", fontSize: "14px" }} labelStyle={{ color: "var(--muted-foreground)", fontWeight: "500", marginBottom: "4px" }} />{allocation.series.map((series) => <Bar key={series.key} dataKey={series.key} name={series.name} stackId="allocation" fill={series.color} maxBarSize={44} animationDuration={700} shape={<StackedBarShape seriesKey={series.key} seriesKeys={seriesKeys} />} />)}</BarChart></ResponsiveContainer></div></> : <p className="py-20 text-center text-sm text-[var(--muted-foreground)]">No worked shifts in this six-month period.</p>}</CardContent></Card>;
}

function JobLimit({ job }: { job: DashboardData["jobs"][number] }) {
  const planned = job.usedMinutes + job.scheduledMinutes;
  const percent = capPercent(planned, job.weeklyLimitMinutes);
  const indicatorClassName = percent >= 100 ? "bg-[var(--danger)]" : percent >= 80 ? "bg-[var(--warning)]" : undefined;

  return <div className="rounded-2xl p-1.5 transition-colors hover:bg-[var(--surface-subtle)]"><div className="mb-2.5 flex justify-between gap-3 px-1 text-sm"><span className="flex items-center gap-2.5 font-semibold"><i className="size-2.5 rounded-full" style={{ background: job.color }} />{job.name}</span><span className="text-[var(--muted-foreground)]">{formatHours(planned)}h{job.weeklyLimitMinutes ? ` / ${formatHours(job.weeklyLimitMinutes)}h` : ""}</span></div><Progress value={percent} indicatorClassName={indicatorClassName} /></div>;
}

function ProjectionStep({ icon: Icon, color, children }: { icon: typeof CheckCircle2; color: string; children: string }) {
  return <p className="flex gap-3 rounded-2xl p-2.5 leading-6 transition-colors hover:bg-[var(--surface-subtle)]"><span className="grid size-8 shrink-0 place-items-center rounded-xl bg-[var(--surface-subtle)]"><Icon className="size-4" style={{ color }} /></span><span>{children}</span></p>;
}
