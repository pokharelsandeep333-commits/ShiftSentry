import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { ArrowUpRight } from "lucide-react";
import { nextPaydayFor } from "@/lib/dashboard-insights";
import { formatCents } from "@/lib/earnings";
import { daysBetween, formatPayDay, type PayPeriodSummary } from "@/lib/pay-period";
import styles from "./dashboard.module.css";

/** The next expected paycheck: when, and roughly how much, from logged and
 *  planned shifts. Split by job only when more than one job pays out. */
export function PaydaySummary({ periods, snapshotAt, timeZone, onShowDetails }: { periods: PayPeriodSummary[]; snapshotAt: string; timeZone: string; onShowDetails: () => void }) {
  const today = formatInTimeZone(snapshotAt, timeZone, "yyyy-MM-dd");
  const payday = nextPaydayFor(periods, today);
  const hasDates = periods.some((period) => period.current.payday !== null);
  const days = payday ? daysBetween(today, payday.date) : 0;

  return <section aria-labelledby="next-payday-title" className={styles.payday}>
    <div className="flex items-center justify-between gap-3">
      <h2 id="next-payday-title" className="font-display text-base font-semibold">Payday</h2>
      {payday
        ? <a href="#pay-periods" onClick={onShowDetails} aria-label="Pay-period details" className="-mr-2 inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full px-2 text-xs font-semibold text-[var(--primary)] transition-colors hover:bg-[var(--primary-soft)] sm:min-h-8">Periods<ArrowUpRight aria-hidden="true" className="size-3.5" /></a>
        : <Link href="/jobs" className="-mr-2 inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full px-2 text-xs font-semibold text-[var(--primary)] transition-colors hover:bg-[var(--primary-soft)] sm:min-h-8">{hasDates ? "Jobs" : "Set up"}<ArrowUpRight aria-hidden="true" className="size-3.5" /></Link>}
    </div>
    {payday ? <>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div>
          <p className="font-semibold">{formatPayDay(payday.date, true)}</p>
          <p className="text-xs text-[var(--muted-foreground)]">{days === 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${days} days`}</p>
        </div>
        <p className="font-display text-2xl font-semibold tracking-[-0.02em] tabular-nums text-[color-mix(in_srgb,var(--success)_78%,var(--foreground))]" title="Estimated net, after tax and deductions">{formatCents(payday.netCents)}<span className="ml-1 font-sans text-xs font-medium tracking-normal text-[var(--muted-foreground)]">est.</span></p>
      </div>
      {payday.jobs.length > 1 && <ul className="mt-3 space-y-1.5 border-t pt-3 text-xs">
        {payday.jobs.map((job) => <li key={job.jobId} className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2"><span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: job.jobColor }} /><span className="truncate" title={job.jobName}>{job.jobName}</span></span>
          <span className="shrink-0 tabular-nums text-[var(--muted-foreground)]">{formatCents(job.netCents)}</span>
        </li>)}
      </ul>}
    </> : <p className="mt-1 text-sm text-[var(--muted-foreground)]">{hasDates ? "No pay due in an upcoming period." : "Add a payday to a job to see your next paycheck."}</p>}
  </section>;
}
