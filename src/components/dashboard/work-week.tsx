"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import type { WorkDay } from "@/lib/dashboard-insights";
import { cn, formatMinutes } from "@/lib/utils";
import styles from "./dashboard.module.css";

export function WorkWeek({ days, timeZone }: { days: WorkDay[]; timeZone: string }) {
  const detailId = useId();
  const initial = days.find((day) => day.isToday) ?? days[0];
  const [selectedDate, setSelectedDate] = useState(initial?.date);
  const selected = days.find((day) => day.date === selectedDate) ?? initial;
  const maxMinutes = Math.max(60, ...days.map((day) => day.workedMinutes + day.scheduledMinutes));
  const shiftCount = new Set(days.flatMap((day) => day.shifts.map((shift) => shift.id))).size;
  if (!selected) return null;

  return <div className={styles.workWeek}>
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
      <h2 className="font-display text-lg font-semibold">Work this week</h2>
      <p className="text-xs text-[var(--muted-foreground)]">{shiftCount} shift{shiftCount === 1 ? "" : "s"} · select a day</p>
    </div>
    <div className={styles.days} role="group" aria-label="Daily work hours">
      {days.map((day) => {
        const total = day.workedMinutes + day.scheduledMinutes;
        return <button key={day.date} type="button" aria-pressed={day.date === selected.date} aria-controls={detailId} aria-label={`${day.weekday}, ${day.date}${day.isToday ? ", today" : ""}: ${formatMinutes(day.workedMinutes)} worked, ${formatMinutes(day.scheduledMinutes)} scheduled`} onClick={() => setSelectedDate(day.date)} className={cn(styles.day, day.date === selected.date && styles.selectedDay)}>
          <span className={cn("text-xs", day.isToday ? "font-semibold text-[var(--primary)]" : "text-[var(--muted-foreground)]")}>{day.weekday}</span>
          <span className="font-display text-lg font-semibold tabular-nums">{day.dayNumber}</span>
          <span className={styles.dayChart} aria-hidden="true">
            {total > 0 ? <span className={styles.dayBar} style={{ height: `${Math.max(8, total / maxMinutes * 100)}%` }}>
              {day.scheduledMinutes > 0 && <span className={styles.scheduledBar} style={{ flex: day.scheduledMinutes }} />}
              {day.workedMinutes > 0 && <span className={styles.workedBar} style={{ flex: day.workedMinutes }} />}
            </span> : <span className={styles.offMark} />}
          </span>
          <span className="whitespace-nowrap text-[11px] font-medium tabular-nums">{total > 0 ? formatMinutes(total) : "Off"}</span>
          <span className={cn(styles.todayDot, !day.isToday && "invisible")} aria-hidden="true" />
        </button>;
      })}
    </div>
    <div className="mt-2 flex gap-4 text-[11px] text-[var(--muted-foreground)]" aria-label="Daily hours legend">
      <span className="flex items-center gap-1.5"><span aria-hidden="true" className={styles.legendWorked} />Worked</span>
      <span className="flex items-center gap-1.5"><span aria-hidden="true" className={styles.legendScheduled} />Scheduled</span>
    </div>
    <div id={detailId} className={styles.dayDetail} aria-live="polite" aria-atomic="true">
      <p className="mb-2 text-xs font-semibold text-[var(--muted-foreground)]">{selected.isToday ? "Today" : formatInTimeZone(`${selected.date}T12:00:00Z`, "UTC", "EEEE, MMM d")}</p>
      {selected.shifts.length > 0 ? <ul className="divide-y">
        {selected.shifts.map((shift) => <li key={shift.id}>
          <Link href={`/shifts/${shift.id}/edit`} className={styles.dayShift}>
            <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full" style={{ background: shift.jobColor }} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium" title={shift.jobName}>{shift.jobName}</span>
              <span className="mt-0.5 block text-xs text-[var(--muted-foreground)]">{formatInTimeZone(shift.startsAt, timeZone, "h:mm a")} – {formatInTimeZone(shift.endsAt, timeZone, "h:mm a")}{formatInTimeZone(shift.startsAt, timeZone, "yyyy-MM-dd") !== formatInTimeZone(shift.endsAt, timeZone, "yyyy-MM-dd") ? " · overnight" : ""}</span>
            </span>
            <span className="text-xs font-medium tabular-nums">{formatMinutes(shift.minutes)}</span>
            <ArrowUpRight aria-hidden="true" className="size-3.5 shrink-0 text-[var(--muted-foreground)]" />
          </Link>
        </li>)}
      </ul> : <p className="text-sm text-[var(--muted-foreground)]">No shifts scheduled.</p>}
    </div>
  </div>;
}
