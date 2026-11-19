import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { ArrowUpRight } from "lucide-react";
import { nextPaydayFor } from "@/lib/dashboard-insights";
import { formatCents } from "@/lib/earnings";
import { formatPayDay, type PayPeriodSummary } from "@/lib/pay-period";
import { cn } from "@/lib/utils";
import { moneyText } from "./money-tone";
import styles from "./dashboard.module.css";

/** The next expected paycheck as one headline: when, and roughly how much.
 *  The countdown and the split by job live on the Pay periods card, which the
 *  link opens. */
export function PaydaySummary({ periods, snapshotAt, timeZone, onShowDetails }: { periods: PayPeriodSummary[]; snapshotAt: string; timeZone: string; onShowDetails: () => void }) {
  const today = formatInTimeZone(snapshotAt, timeZone, "yyyy-MM-dd");
  const payday = nextPaydayFor(periods, today);
  const hasDates = periods.some((period) => period.current.payday !== null);

  return <section aria-labelledby="next-payday-title" className={styles.payday}>
    <div className="flex items-center justify-between gap-3">
      <h2 id="next-payday-title" className="font-display text-base font-semibold">Payday</h2>
      {payday
        ? <a href="#pay-periods" onClick={onShowDetails} aria-label="Pay-period details" className="-mr-2 inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full px-2 text-xs font-semibold text-[var(--primary)] transition-colors hover:bg-[var(--primary-soft)] sm:min-h-8">Periods<ArrowUpRight aria-hidden="true" className="size-3.5" /></a>
        : <Link href="/jobs" className="-mr-2 inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full px-2 text-xs font-semibold text-[var(--primary)] transition-colors hover:bg-[var(--primary-soft)] sm:min-h-8">{hasDates ? "Jobs" : "Set up"}<ArrowUpRight aria-hidden="true" className="size-3.5" /></Link>}
    </div>
    {payday
      ? <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="font-semibold">{formatPayDay(payday.date, true)}</p>
        <p className={cn("font-display text-2xl font-semibold tracking-[-0.02em] tabular-nums", moneyText(payday.netCents))} title="Estimated net, after tax and deductions">{formatCents(payday.netCents)}<span className="ml-1 font-sans text-xs font-medium tracking-normal text-[var(--muted-foreground)]">est.</span></p>
      </div>
      : <p className="mt-1 text-sm text-[var(--muted-foreground)]">{hasDates ? "No pay due in an upcoming period." : "Add a payday to a job to see your next paycheck."}</p>}
  </section>;
}
