import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import type { RecentCompletedShift } from "@/lib/dashboard-insights";
import { formatCents } from "@/lib/earnings";
import { formatMinutes } from "@/lib/utils";
import styles from "./dashboard.module.css";

export function RecentShifts({ shifts, timeZone }: { shifts: RecentCompletedShift[]; timeZone: string }) {
  return <Card role="region" aria-labelledby="recent-shifts-title" className="mt-5">
    <CardHeader>
      <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <CardTitle id="recent-shifts-title">Recent shifts</CardTitle>
          <CardDescription className="mt-1">Latest completed work, with net pay after configured tax and deductions.</CardDescription>
        </div>
        <Link href="/shifts?show=worked" className="inline-flex min-h-11 shrink-0 items-center gap-1 text-xs font-semibold text-[var(--primary)] sm:min-h-8">View log<ArrowUpRight aria-hidden="true" className="size-3.5" /></Link>
      </div>
    </CardHeader>
    <CardContent>
      {shifts.length > 0 ? <ul className="divide-y border-t">
        {shifts.map((shift) => {
          const overnight = formatInTimeZone(shift.startsAt, timeZone, "yyyy-MM-dd") !== formatInTimeZone(shift.endsAt, timeZone, "yyyy-MM-dd");
          return <li key={shift.id}>
            <Link href={`/shifts/${shift.id}/edit`} className={styles.recentShift} aria-label={`Open ${shift.jobName}, completed ${formatInTimeZone(shift.endsAt, timeZone, "MMMM d")}, ${formatMinutes(shift.minutes)}, ${formatCents(shift.netCents)} net`}>
              <time dateTime={shift.endsAt} className={styles.recentDate}><span>{formatInTimeZone(shift.endsAt, timeZone, "MMM d")}</span><span className="mt-1 text-[11px] font-normal text-[var(--muted-foreground)]">{formatInTimeZone(shift.endsAt, timeZone, "EEE")}</span></time>
              <span className="flex min-w-0 items-start gap-2.5">
                <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: shift.jobColor }} />
                <span className="min-w-0">
                  <span className="block break-words text-sm font-medium [overflow-wrap:anywhere]">{shift.jobName}</span>
                  <span className="mt-1 block text-xs leading-5 text-[var(--muted-foreground)]">{formatInTimeZone(shift.startsAt, timeZone, overnight ? "MMM d, h:mm a" : "h:mm a")} – {formatInTimeZone(shift.endsAt, timeZone, overnight ? "MMM d, h:mm a" : "h:mm a")}</span>
                </span>
              </span>
              <span className="text-right">
                <span className="block whitespace-nowrap text-sm font-semibold tabular-nums">{formatCents(shift.netCents)}<span className="sr-only"> net</span></span>
                <span className="mt-1 block whitespace-nowrap text-xs tabular-nums text-[var(--muted-foreground)]">{formatMinutes(shift.minutes)}</span>
              </span>
              <ArrowUpRight aria-hidden="true" className="hidden size-4 text-[var(--muted-foreground)] sm:block" />
            </Link>
          </li>;
        })}
      </ul> : <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
        <p className="text-sm text-[var(--muted-foreground)]">Your completed shifts will appear here.</p>
      </div>}
    </CardContent>
  </Card>;
}
