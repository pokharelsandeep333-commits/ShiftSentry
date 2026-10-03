"use client";

import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addLocalDays, addMonths, longDayLabel, monthGridDays, monthLabel } from "@/lib/calendar-range";
import { cn } from "@/lib/utils";

const MOVES: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
const narrowWeekday = (day: string) => formatInTimeZone(`${day}T12:00:00.000Z`, "UTC", "EEEEE");
const fullWeekday = (day: string) => formatInTimeZone(`${day}T12:00:00.000Z`, "UTC", "EEEE");

/**
 * The rail's month picker. Its arrows page the picker only -- the big grid
 * stays put until a day is chosen, as in Google Calendar -- so the month shown
 * is local state, seeded from the page's date (the page keys this on that
 * month, so moving the big grid into another month re-seeds it). A day is a
 * link to the same view at that date. One day is in the tab order and the
 * arrow keys move between days, so the 42 links are one tab stop, not 42.
 */
export function MiniMonth({ anchor, today, view, weekStartsOn, selectedDays }: { anchor: string; today: string; view: "week" | "month"; weekStartsOn: number; selectedDays: string[] }) {
  const [month, setMonth] = useState(anchor.slice(0, 7));
  const [focusDay, setFocusDay] = useState(anchor);
  const moved = useRef(false);
  const grid = useRef<HTMLDivElement>(null);
  const days = monthGridDays(month, weekStartsOn);
  const selected = new Set(selectedDays);
  const tabbable = days.includes(focusDay) ? focusDay : `${month}-01`;

  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    grid.current?.querySelector<HTMLElement>(`[data-day="${focusDay}"]`)?.focus();
  }, [focusDay, month]);

  function onKeyDown(event: KeyboardEvent, day: string, index: number) {
    let target: string | null = null;
    if (event.key in MOVES) target = addLocalDays(day, MOVES[event.key]);
    else if (event.key === "Home") target = addLocalDays(day, -(index % 7));
    else if (event.key === "End") target = addLocalDays(day, 6 - (index % 7));
    else if (event.key === "PageUp" || event.key === "PageDown") {
      const next = addMonths(`${day.slice(0, 7)}-01`, event.key === "PageUp" ? -1 : 1);
      // The same day of the month, or the month's last day when it is shorter.
      const lastDay = addLocalDays(addMonths(next, 1), -1);
      target = Number(day.slice(8)) > Number(lastDay.slice(8)) ? lastDay : `${next.slice(0, 7)}-${day.slice(8)}`;
    }
    if (!target) return;
    event.preventDefault();
    moved.current = true;
    if (!days.includes(target) || event.key.startsWith("Page")) setMonth(target.slice(0, 7));
    setFocusDay(target);
  }

  const page = (months: number) => setMonth(addMonths(`${month}-01`, months).slice(0, 7));
  const arrow = "grid size-7 place-items-center rounded-full text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-subtle)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]";

  return <div>
    <div className="flex items-center justify-between pl-2">
      <p className="font-display text-sm font-semibold" aria-live="polite">{monthLabel(month)}</p>
      <div className="flex items-center">
        <button type="button" onClick={() => page(-1)} aria-label="Show previous month" className={arrow}><ChevronLeft className="size-4" /></button>
        <button type="button" onClick={() => page(1)} aria-label="Show next month" className={arrow}><ChevronRight className="size-4" /></button>
      </div>
    </div>
    <div className="mt-1 grid grid-cols-7 text-center" aria-hidden="true">
      {days.slice(0, 7).map((day) => <span key={day} title={fullWeekday(day)} className="py-0.5 text-[11px] font-medium text-[var(--muted-foreground)]">{narrowWeekday(day)}</span>)}
    </div>
    <div ref={grid} className="grid grid-cols-7">
      {days.map((day, index) => {
        const inMonth = day.slice(0, 7) === month;
        const isToday = day === today;
        const band = selected.has(day);
        const column = index % 7;
        return <div key={day} className={cn("flex justify-center", band && "bg-[var(--primary-soft)]", band && (column === 0 || !selected.has(days[index - 1])) && "rounded-l-full", band && (column === 6 || !selected.has(days[index + 1])) && "rounded-r-full")}>
          <Link
            href={`/calendar?view=${view}&date=${day}`}
            prefetch={false}
            data-day={day}
            tabIndex={day === tabbable ? 0 : -1}
            onKeyDown={(event) => onKeyDown(event, day, index)}
            onFocus={() => setFocusDay(day)}
            aria-label={`${longDayLabel(day)}${isToday ? ", today" : ""}`}
            aria-current={day === anchor ? "date" : undefined}
            className={cn(
              "grid size-9 place-items-center rounded-full text-xs tabular-nums lg:size-7 lg:text-[11px] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--primary)]",
              isToday ? "bg-[var(--primary)] font-semibold text-[var(--primary-foreground)]" : day === anchor ? "font-semibold text-[var(--primary)] ring-1 ring-inset ring-[color-mix(in_srgb,var(--primary)_45%,transparent)]" : inMonth ? "text-[var(--foreground)] hover:bg-[var(--surface-subtle)]" : "text-[var(--muted-foreground)] opacity-70 hover:bg-[var(--surface-subtle)]",
            )}
          >{Number(day.slice(8))}</Link>
        </div>;
      })}
    </div>
  </div>;
}
