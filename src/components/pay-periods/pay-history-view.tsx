import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { formatCents } from "@/lib/earnings";
import { formatPayDay, formatPayPeriod, type PayPeriodHistoryEntry } from "@/lib/pay-period";
import { PAY_HISTORY_STEP, type PayHistory } from "@/lib/pay-history";
import { cn, formatMinutes } from "@/lib/utils";

const MONEY = "text-[color-mix(in_srgb,var(--success)_78%,var(--foreground))]";

function historyHref(jobId: string, count?: number) {
  const params = new URLSearchParams({ job: jobId });
  if (count && count > PAY_HISTORY_STEP) params.set("periods", String(count));
  return `/pay-periods?${params}`;
}

/** Years only change the grouping, so a list inside one year carries no year headings. */
function byYear(periods: PayPeriodHistoryEntry[]) {
  const groups: { year: string; periods: PayPeriodHistoryEntry[] }[] = [];
  for (const period of periods) {
    const year = period.start.slice(0, 4);
    const last = groups[groups.length - 1];
    if (last?.year === year) last.periods.push(period);
    else groups.push({ year, periods: [period] });
  }
  return groups;
}

function PeriodRow({ period, today }: { period: PayPeriodHistoryEntry; today: string }) {
  const empty = period.worked.minutes === 0 && period.scheduled.minutes === 0;
  const paid = period.payday !== null && period.payday < today;
  return <li className={cn("grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-6 gap-y-0.5 px-5 py-4 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_5rem_7rem] sm:px-6", period.isCurrent && "bg-[color-mix(in_srgb,var(--primary)_5%,var(--card))]", empty && !period.isCurrent && "text-[var(--muted-foreground)]")}>
    <p className="flex min-w-0 items-center gap-2.5 text-sm font-semibold tabular-nums">
      <span className="truncate">{formatPayPeriod(period)}</span>
      {period.isCurrent && <span className="shrink-0 rounded-full bg-[color-mix(in_srgb,var(--primary)_12%,var(--card))] px-2 py-0.5 text-[11px] font-semibold text-[color-mix(in_srgb,var(--primary)_88%,var(--foreground))]">Current</span>}
    </p>
    <p className={cn("text-right font-display text-base font-semibold tabular-nums sm:order-last", !empty && MONEY)}>{formatCents(period.worked.netCents)}</p>
    <p className="text-xs text-[var(--muted-foreground)] sm:text-sm" title="Estimated from the job's payday setting">{period.payday ? `${paid ? "Paid" : "Pays"} ${formatPayDay(period.payday, true)}` : "No payday set"}</p>
    <p className="text-right text-xs tabular-nums text-[var(--muted-foreground)] sm:text-sm">
      {formatMinutes(period.worked.minutes)}
      {period.scheduled.netCents > 0 && <span className="block text-xs" title="Planned shifts left in this period">+{formatCents(period.scheduled.netCents)} planned</span>}
    </p>
  </li>;
}

/**
 * Every pay period of one job, newest first, six at a time. Estimates from the
 * shifts' own pay snapshots; nothing about a period is stored, so changing the
 * job's schedule regroups this list without changing any amount.
 */
export function PayHistoryView({ history, count, today }: { history: PayHistory; count: number; today: string }) {
  const { jobs, job, periods, hasOlder } = history;
  if (!job) return <>
    <PageHeader title="Pay periods" />
    <div className="premium-card flex flex-col items-start gap-3 rounded-2xl border p-6">
      <p className="font-medium">No pay schedule yet.</p>
      <Link href="/jobs" className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-[var(--primary)] sm:min-h-8">Add one to a job<ArrowUpRight aria-hidden="true" className="size-4" /></Link>
    </div>
  </>;

  return <>
    <PageHeader title="Pay periods" description={`${job.scheduleLabel}. Estimated net, after tax and deductions.`} />
    {jobs.length > 1 && <nav aria-label="Job" className="mb-5 flex flex-wrap gap-2">
      {jobs.map((entry) => {
        const active = entry.id === job.id;
        return <Link key={entry.id} href={historyHref(entry.id)} aria-current={active ? "true" : undefined} scroll={false} className={cn(
          "press inline-flex min-h-9 max-w-full items-center gap-2 whitespace-nowrap rounded-full border px-3 text-xs font-semibold outline-none focus-visible:ring-4 focus-visible:ring-[var(--primary-soft)]",
          active ? "border-[color-mix(in_srgb,var(--primary)_35%,var(--border))] bg-[var(--primary-soft)] text-[var(--primary)]" : "bg-[var(--card)]/60 text-[var(--muted-foreground)] hover:bg-[var(--surface-subtle)] hover:text-[var(--foreground)]",
        )}><span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: entry.color }} /><span className="truncate">{entry.name}</span></Link>;
      })}
    </nav>}

    <section aria-label={`${job.name} pay periods`} className="premium-card overflow-hidden rounded-2xl border bg-[var(--card)]">
      {byYear(periods).map((group, index, groups) => <div key={group.year}>
        {(groups.length > 1 || group.year !== today.slice(0, 4)) && <h2 className={cn("bg-[var(--surface-subtle)] px-5 py-2 text-xs font-semibold tabular-nums text-[var(--muted-foreground)] sm:px-6", index > 0 && "border-t")}>{group.year}</h2>}
        <ul className="divide-y">{group.periods.map((period) => <PeriodRow key={period.start} period={period} today={today} />)}</ul>
      </div>)}
      {hasOlder && <div className="border-t p-3 text-center">
        <Link href={historyHref(job.id, count + PAY_HISTORY_STEP)} scroll={false} className="press inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold text-[var(--primary)] outline-none transition-colors hover:bg-[var(--primary-soft)] focus-visible:ring-4 focus-visible:ring-[var(--primary-soft)] sm:min-h-9">Load older</Link>
      </div>}
    </section>
  </>;
}
