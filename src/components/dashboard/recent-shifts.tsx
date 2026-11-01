import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import type { RecentCompletedShift } from "@/lib/dashboard-insights";
import { formatCents } from "@/lib/earnings";
import { formatMinutes } from "@/lib/utils";
import styles from "./dashboard.module.css";

/** The latest completed shifts, each one row: date, job and times, then what it paid. */
export function RecentShifts({ shifts, timeZone }: { shifts: RecentCompletedShift[]; timeZone: string }) {
  return <section aria-labelledby="recent-shifts-title" className={`premium-card border ${styles.recent}`}>
    <div className="mb-2 flex items-center justify-between gap-3">
      <h2 id="recent-shifts-title" className="font-display text-lg font-semibold">Recent shifts</h2>
      <Link href="/shifts?show=worked" className="-mr-2 inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full px-2 text-xs font-semibold text-[var(--primary)] transition-colors hover:bg-[var(--primary-soft)] sm:min-h-8">Log<ArrowUpRight aria-hidden="true" className="size-3.5" /></Link>
    </div>
    {shifts.length > 0 ? <ul>
      {shifts.map((shift) => {
        const overnight = formatInTimeZone(shift.startsAt, timeZone, "yyyy-MM-dd") !== formatInTimeZone(shift.endsAt, timeZone, "yyyy-MM-dd");
        return <li key={shift.id}>
          <Link href={`/shifts/${shift.id}/edit`} className={styles.recentShift} aria-label={`Open ${shift.jobName}, completed ${formatInTimeZone(shift.endsAt, timeZone, "MMMM d")}, ${formatMinutes(shift.minutes)}, ${formatCents(shift.netCents)} net`}>
            <time dateTime={shift.endsAt} className={styles.recentDate}><span>{formatInTimeZone(shift.endsAt, timeZone, "MMM")}</span><span>{formatInTimeZone(shift.endsAt, timeZone, "d")}</span></time>
            <span className="min-w-0">
              <span className="flex min-w-0 items-center gap-2"><span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: shift.jobColor }} /><span className="truncate text-sm font-medium" title={shift.jobName}>{shift.jobName}</span></span>
              <span className="mt-0.5 block text-xs tabular-nums text-[var(--muted-foreground)]">{formatInTimeZone(shift.endsAt, timeZone, "EEE")} · {formatInTimeZone(shift.startsAt, timeZone, overnight ? "MMM d, h:mm a" : "h:mm a")} – {formatInTimeZone(shift.endsAt, timeZone, overnight ? "MMM d, h:mm a" : "h:mm a")}</span>
            </span>
            <span className={styles.recentHours}>{formatMinutes(shift.minutes)}</span>
            <span className="whitespace-nowrap text-right text-sm font-semibold tabular-nums">{formatCents(shift.netCents)}<span className="sr-only"> net</span></span>
          </Link>
        </li>;
      })}
    </ul> : <p className="py-3 text-sm text-[var(--muted-foreground)]">Completed shifts land here.</p>}
  </section>;
}
