import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { ArrowUpRight } from "lucide-react";
import { nextPaydayFor } from "@/lib/dashboard-insights";
import { formatCents } from "@/lib/earnings";
import { daysBetween, formatPayDay, type PayPeriodSummary } from "@/lib/pay-period";
import styles from "./dashboard.module.css";

export function PaydaySummary({ periods, snapshotAt, timeZone, onShowDetails }: { periods: PayPeriodSummary[]; snapshotAt: string; timeZone: string; onShowDetails: () => void }) {
  const today = formatInTimeZone(snapshotAt, timeZone, "yyyy-MM-dd");
  const payday = nextPaydayFor(periods, today);
  const hasDates = periods.some((period) => period.current.payday !== null);
  const days = payday ? daysBetween(today, payday.date) : 0;

  return <section aria-labelledby="next-payday-title" className={styles.payday}>
    <div className="flex items-baseline justify-between gap-3">
      <h2 id="next-payday-title" className="font-display text-base font-semibold">Next payday</h2>
      {payday && <span className="text-xs text-[var(--muted-foreground)]">{days === 0 ? "Expected today" : days === 1 ? "Tomorrow" : `In ${days} days`}</span>}
    </div>
    {payday ? <>
      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-display text-xl font-semibold">{formatPayDay(payday.date, true)}</p>
        <p className="font-display text-2xl font-semibold tabular-nums">{formatCents(payday.netCents)}<span className="ml-1.5 font-sans text-xs font-normal text-[var(--muted-foreground)]">est. net</span></p>
      </div>
      <ul className="mt-3 space-y-2 text-xs">
        {payday.jobs.map((job) => <li key={job.jobId} className="flex items-center justify-between gap-3">
          <span className="flex min-w-0 items-center gap-2"><span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: job.jobColor }} /><span className="truncate" title={job.jobName}>{job.jobName}</span></span>
          <span className="shrink-0 tabular-nums text-[var(--muted-foreground)]">{formatCents(job.netCents)}</span>
        </li>)}
      </ul>
      <div className={styles.paydayFooter}>
        <p className="text-[11px] leading-5 text-[var(--muted-foreground)]">Based on logged and scheduled shifts.</p>
        <a href="#pay-periods" onClick={onShowDetails} aria-label="Pay-period details" className="inline-flex min-h-11 shrink-0 items-center gap-1 text-xs font-semibold text-[var(--primary)] sm:min-h-8">Details<ArrowUpRight aria-hidden="true" className="size-3.5" /></a>
      </div>
    </> : <>
      <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">{hasDates ? "No logged or scheduled pay in an upcoming period." : "Add a pay schedule and payday to a job to see your next estimated paycheck."}</p>
      <Link href="/jobs" className="mt-1 inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-[var(--primary)] sm:min-h-8">{hasDates ? "Manage jobs" : "Set up payday"}<ArrowUpRight aria-hidden="true" className="size-3.5" /></Link>
    </>}
  </section>;
}
