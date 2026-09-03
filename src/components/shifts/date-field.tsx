"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDismissable } from "@/components/ui/use-dismissable";

type DateFieldProps = {
  id: string;
  value: string;
  onChange: (date: string) => void;
  /** Today in the viewer's zone, so "Today" means their today and not the server's. */
  today: string;
  ariaLabel: string;
  describedBy?: string;
  invalid?: boolean;
  align?: "left" | "right";
};

const monthFormatter = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });
const triggerFormatter = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const dayFormatter = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" });
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const QUICK_DATES = [{ label: "Today", days: 0 }, { label: "Yesterday", days: -1 }, { label: "Tomorrow", days: 1 }];

function parseDate(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const candidate = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return candidate.getUTCFullYear() === Number(match[1]) && candidate.getUTCMonth() === Number(match[2]) - 1 && candidate.getUTCDate() === Number(match[3]) ? candidate : null;
}

export function dateValue(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

/** Calendar-day arithmetic on the date string, so a DST day never shifts the result. */
export function shiftCalendarDays(date: string, days: number) {
  const parsed = parseDate(date);
  if (!parsed) return "";
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return dateValue(parsed);
}

export function formatDateLabel(date: string) {
  const parsed = parseDate(date);
  return parsed ? triggerFormatter.format(parsed) : "";
}

function startOfMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function moveMonth(month: Date, amount: number) {
  return new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + amount, 1));
}

function calendarDays(month: Date) {
  const firstVisibleDay = startOfMonth(month);
  firstVisibleDay.setUTCDate(firstVisibleDay.getUTCDate() - firstVisibleDay.getUTCDay());
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(firstVisibleDay);
    day.setUTCDate(firstVisibleDay.getUTCDate() + index);
    return day;
  });
}

/** Same day-of-month in a neighbouring month, clamped to that month's length. */
function sameDayInMonth(month: Date, amount: number, day: number) {
  const target = moveMonth(month, amount);
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return dateValue(target);
}

export function DateField({ id, value, onChange, today, ariaLabel, describedBy, invalid, align = "left" }: DateFieldProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [focusedDate, setFocusedDate] = useState(() => value || today);
  const month = useMemo(() => startOfMonth(parseDate(focusedDate) ?? parseDate(today) ?? new Date()), [focusedDate, today]);
  const days = useMemo(() => calendarDays(month), [month]);
  const focusedDayOfMonth = parseDate(focusedDate)?.getUTCDate() ?? 1;

  const dismiss = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  useDismissable(open, rootRef, dismiss);

  useEffect(() => {
    if (!open) return;
    gridRef.current?.querySelector<HTMLElement>("[data-focused]")?.focus();
  }, [focusedDate, open]);

  function openCalendar() {
    setFocusedDate(value || today);
    setOpen(true);
  }

  // Selecting commits straight away. Nothing is staged, so dismissing the panel
  // by any route can no longer throw away the day the user just clicked.
  function select(date: string) {
    onChange(date);
    setFocusedDate(date);
    setOpen(false);
    requestAnimationFrame(() => triggerRef.current?.focus());
  }

  function handleGridKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const steps: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 };
    if (event.key in steps) {
      event.preventDefault();
      setFocusedDate((current) => shiftCalendarDays(current, steps[event.key]) || current);
      return;
    }
    if (event.key === "PageUp" || event.key === "PageDown") {
      event.preventDefault();
      setFocusedDate(sameDayInMonth(month, event.key === "PageUp" ? -1 : 1, focusedDayOfMonth));
    }
  }

  const label = formatDateLabel(value);

  return <div ref={rootRef} className="relative">
    <button
      ref={triggerRef}
      id={id}
      type="button"
      aria-label={ariaLabel}
      aria-expanded={open}
      aria-haspopup="dialog"
      aria-describedby={describedBy}
      className={cn("field-control flex items-center justify-between gap-2 text-left text-sm font-medium", !label && "text-[var(--muted-foreground)]", invalid && "border-[var(--danger)]")}
      onClick={() => (open ? dismiss(false) : openCalendar())}
    >
      <span className="truncate">{label || "Select a date"}</span>
      <CalendarDays className="size-4 shrink-0 text-[var(--muted-foreground)]" />
    </button>
    {open && <div
      role="dialog"
      aria-label={ariaLabel}
      className={cn("absolute z-50 mt-2 w-[min(21rem,calc(100vw-2rem))] rounded-2xl border border-[color-mix(in_srgb,var(--primary)_24%,var(--border))] bg-[var(--card)] p-3 shadow-2xl shadow-black/20", align === "right" ? "right-0" : "left-0")}
    >
      <div className="flex flex-wrap gap-1.5 pb-3">
        {QUICK_DATES.map((chip) => {
          const chipDate = shiftCalendarDays(today, chip.days);
          return <Button key={chip.label} type="button" variant={value === chipDate ? "default" : "outline"} size="sm" className="flex-1" onClick={() => select(chipDate)}>{chip.label}</Button>;
        })}
      </div>
      <div className="flex items-center justify-between gap-2 border-t pt-3">
        <Button type="button" variant="ghost" size="icon" aria-label="Previous month" className="size-8" onClick={() => setFocusedDate(sameDayInMonth(month, -1, focusedDayOfMonth))}><ChevronLeft className="size-4" /></Button>
        <p className="text-sm font-semibold">{monthFormatter.format(month)}</p>
        <Button type="button" variant="ghost" size="icon" aria-label="Next month" className="size-8" onClick={() => setFocusedDate(sameDayInMonth(month, 1, focusedDayOfMonth))}><ChevronRight className="size-4" /></Button>
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1 text-center text-xs font-medium text-[var(--muted-foreground)]" aria-hidden="true">{WEEKDAYS.map((day) => <span key={day} className="py-1">{day}</span>)}</div>
      <div ref={gridRef} role="grid" aria-label={monthFormatter.format(month)} className="grid grid-cols-7 gap-1" onKeyDown={handleGridKeyDown}>
        {days.map((day) => {
          const dayValue = dateValue(day);
          const outsideMonth = day.getUTCMonth() !== month.getUTCMonth();
          const selected = value === dayValue;
          const focused = focusedDate === dayValue;
          return <button
            key={dayValue}
            type="button"
            role="gridcell"
            tabIndex={focused ? 0 : -1}
            data-focused={focused ? "" : undefined}
            aria-label={dayFormatter.format(day)}
            aria-selected={selected}
            aria-current={dayValue === today ? "date" : undefined}
            className={cn(
              "grid aspect-square place-items-center rounded-lg text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--primary)]",
              outsideMonth && !selected && "text-[var(--muted-foreground)] opacity-55",
              dayValue === today && !selected && "ring-1 ring-inset ring-[color-mix(in_srgb,var(--primary)_45%,transparent)]",
              selected ? "bg-[var(--primary)] text-[var(--primary-foreground)]" : "hover:bg-[var(--primary-soft)] hover:text-[var(--primary)]",
            )}
            onClick={() => select(dayValue)}
          >
            {day.getUTCDate()}
          </button>;
        })}
      </div>
    </div>}
  </div>;
}
