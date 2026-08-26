"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatShiftDateAndTime, parseShiftDateTimeInput } from "@/lib/shift-date-time";

export type ShiftDateTimeParts = { date: string; time: string };

type DateTimePickerProps = {
  label: string;
  name: "startsAt" | "endsAt";
  value: ShiftDateTimeParts;
  onChange: (next: ShiftDateTimeParts, dateChanged: boolean) => void;
  error?: string;
};

function parseDate(date: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const candidate = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return candidate.getUTCFullYear() === Number(match[1]) && candidate.getUTCMonth() === Number(match[2]) - 1 && candidate.getUTCDate() === Number(match[3]) ? candidate : null;
}

function dateValue(date: Date) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
}

function startOfMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function currentMonth() {
  const now = new Date();
  return new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1));
}

function moveMonth(month: Date, amount: number) {
  return new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + amount, 1));
}

function calendarDays(month: Date) {
  const firstDay = startOfMonth(month);
  const firstVisibleDay = new Date(firstDay);
  firstVisibleDay.setUTCDate(firstDay.getUTCDate() - firstDay.getUTCDay());
  return Array.from({ length: 42 }, (_, index) => {
    const day = new Date(firstVisibleDay);
    day.setUTCDate(firstVisibleDay.getUTCDate() + index);
    return day;
  });
}

function monthLabel(month: Date) {
  return new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(month);
}

function dayLabel(day: Date) {
  return new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" }).format(day);
}

export function DateTimePicker({ label, name, value, onChange, error }: DateTimePickerProps) {
  const inputId = `${name}-input`;
  const helpId = `${name}-help`;
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const normalizedValue = formatShiftDateAndTime(value.date, value.time);
  const [inputState, setInputState] = useState(() => ({ source: normalizedValue, value: normalizedValue }));
  const displayValue = inputState.source === normalizedValue ? inputState.value : normalizedValue;
  const [entryError, setEntryError] = useState("");
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => startOfMonth(parseDate(value.date) ?? currentMonth()));
  const [pickerValue, setPickerValue] = useState<ShiftDateTimeParts>(() => value);
  const days = useMemo(() => calendarDays(month), [month]);
  const fieldError = entryError || error;

  const closePicker = useCallback((restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  const discardPicker = useCallback((restoreFocus = false) => {
    setPickerValue(value);
    setInputState({ source: normalizedValue, value: normalizedValue });
    closePicker(restoreFocus);
  }, [closePicker, normalizedValue, value]);

  useEffect(() => {
    if (!open) return;

    function closeOnOutsideClick(event: PointerEvent) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) discardPicker();
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      discardPicker(true);
    }

    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [discardPicker, open]);

  function commitTypedValue() {
    const rawValue = displayValue.trim();
    if (!rawValue) {
      setEntryError(`Enter a ${label.toLowerCase()} date and time.`);
      return false;
    }

    const parsed = parseShiftDateTimeInput(rawValue);
    if (!parsed) {
      setEntryError("Enter a valid date and time with AM or PM.");
      return false;
    }

    setEntryError("");
    setInputState({ source: parsed.formatted, value: parsed.formatted });
    onChange({ date: parsed.date, time: parsed.time }, parsed.date !== value.date);
    return true;
  }

  function handleInputBlur() {
    requestAnimationFrame(() => {
      if (rootRef.current?.contains(document.activeElement)) return;
      commitTypedValue();
    });
  }

  function openPicker() {
    if (open) {
      discardPicker(true);
      return;
    }

    setPickerValue(value);
    setMonth(startOfMonth(parseDate(value.date) ?? currentMonth()));
    setOpen(true);
  }

  function selectDate(date: Date) {
    const next = { ...pickerValue, date: dateValue(date) };
    setEntryError("");
    setPickerValue(next);
    setInputState({ source: normalizedValue, value: formatShiftDateAndTime(next.date, next.time) });
  }

  function selectTime(time: string) {
    const next = { ...pickerValue, time };
    setPickerValue((current) => ({ ...current, time }));
    setInputState({ source: normalizedValue, value: formatShiftDateAndTime(next.date, next.time) });
  }

  function applyPickerValue() {
    if (!pickerValue.date || !pickerValue.time) {
      setEntryError("Choose both a date and time.");
      return;
    }

    const nextDisplayValue = formatShiftDateAndTime(pickerValue.date, pickerValue.time);
    setEntryError("");
    setInputState({ source: nextDisplayValue, value: nextDisplayValue });
    onChange(pickerValue, pickerValue.date !== value.date);
    closePicker(true);
  }

  return <fieldset className="rounded-2xl border bg-[var(--card)]/45 p-4">
    <legend className="px-1 font-semibold">{label}</legend>
    <div ref={rootRef} className="relative mt-2">
      <label className="field-label" htmlFor={inputId}><span>Date and time</span></label>
      <div className="relative mt-2">
        <input
          id={inputId}
          name={name}
          value={displayValue}
          onChange={(event) => setInputState({ source: normalizedValue, value: event.target.value })}
          onBlur={handleInputBlur}
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            commitTypedValue();
          }}
          inputMode="text"
          autoComplete="off"
          aria-invalid={Boolean(fieldError)}
          aria-describedby={fieldError ? helpId : undefined}
          className="field-control pr-12"
        />
        <Button ref={triggerRef} type="button" variant="ghost" size="icon" aria-label={`Choose ${label.toLowerCase()} date and time`} aria-expanded={open} aria-haspopup="dialog" className="absolute right-1 top-1/2 size-9 -translate-y-1/2" onClick={openPicker}><CalendarDays className="size-4" /></Button>
      </div>
      {open && <div role="dialog" aria-label={`${label} date and time picker`} className={cn("absolute z-50 mt-2 w-[min(34rem,calc(100vw-2rem))] rounded-2xl border border-[color-mix(in_srgb,var(--primary)_24%,var(--border))] bg-[var(--card)] p-3 shadow-2xl shadow-black/20", name === "endsAt" ? "right-0" : "left-0")}>
        <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
          <div>
            <div className="flex items-center justify-between gap-2">
              <Button type="button" variant="ghost" size="icon" aria-label="Previous month" className="size-8" onClick={() => setMonth((current) => moveMonth(current, -1))}><ChevronLeft className="size-4" /></Button>
              <p className="text-sm font-semibold">{monthLabel(month)}</p>
              <Button type="button" variant="ghost" size="icon" aria-label="Next month" className="size-8" onClick={() => setMonth((current) => moveMonth(current, 1))}><ChevronRight className="size-4" /></Button>
            </div>
            <div className="mt-3 grid grid-cols-7 gap-1 text-center text-xs font-medium text-[var(--muted-foreground)]" aria-hidden="true">{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => <span key={day} className="py-1">{day}</span>)}</div>
            <div className="grid grid-cols-7 gap-1" aria-label={`${monthLabel(month)} calendar`}>
              {days.map((day) => {
                const isCurrentMonth = day.getUTCMonth() === month.getUTCMonth();
                const selected = pickerValue.date === dateValue(day);
                return <button key={dateValue(day)} type="button" aria-label={dayLabel(day)} aria-pressed={selected} disabled={!isCurrentMonth} className={cn("grid aspect-square place-items-center rounded-lg text-sm font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--primary)] disabled:cursor-default disabled:opacity-35", selected ? "bg-[var(--primary)] text-[var(--primary-foreground)]" : "hover:bg-[var(--primary-soft)] hover:text-[var(--primary)]")} onClick={() => selectDate(day)}>{day.getUTCDate()}</button>;
              })}
            </div>
          </div>
          <div className="flex flex-col border-t pt-4 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
            <label className="field-label text-xs"><span>Time</span><input type="time" value={pickerValue.time} disabled={!pickerValue.date} onChange={(event) => selectTime(event.target.value)} className="field-control mt-2 h-10 text-sm" /></label>
            <div className="mt-4 flex gap-2 sm:mt-auto sm:pt-4">
              <Button type="button" variant="outline" size="sm" className="flex-1" onClick={() => discardPicker(true)}>Cancel</Button>
              <Button type="button" size="sm" className="flex-1" onClick={applyPickerValue}>Done</Button>
            </div>
          </div>
        </div>
      </div>}
    </div>
    {fieldError && <p id={helpId} role="alert" className="mt-3 text-sm font-medium text-[var(--danger)]">{fieldError}</p>}
  </fieldset>;
}
