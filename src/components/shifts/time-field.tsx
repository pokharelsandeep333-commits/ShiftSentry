"use client";

import { useCallback, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDismissable } from "@/components/ui/use-dismissable";
import { TimeWheel } from "@/components/shifts/time-wheel";
import { formatTimeOfDay, parseTimeOfDay } from "@/components/shifts/time-parsing";

type TimeFieldProps = {
  id: string;
  value: string;
  /** null reports text that could not be read as a time, so the caller can surface it. */
  onChange: (time: string | null) => void;
  /** Where the wheel starts when the field is still empty. */
  fallback: string;
  ariaLabel: string;
  describedBy?: string;
  invalid?: boolean;
};

export function TimeField({ id, value, onChange, fallback, ariaLabel, describedBy, invalid }: TimeFieldProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<string | null>(null);

  const display = draft ?? formatTimeOfDay(value);
  // A half-typed time still steers the wheel, so the two halves of the field
  // never disagree about what is selected.
  const wheelValue = (draft === null ? null : parseTimeOfDay(draft)) ?? value ?? "";

  const dismiss = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) inputRef.current?.focus();
  }, []);

  useDismissable(open, rootRef, dismiss);

  function commitTypedValue() {
    if (draft === null) return;
    const trimmed = draft.trim();
    if (!trimmed) {
      setDraft(null);
      onChange("");
      return;
    }
    const parsed = parseTimeOfDay(trimmed);
    // An unreadable entry stays on screen and reports itself, rather than
    // reverting behind the user's back.
    onChange(parsed);
    if (parsed) setDraft(null);
  }

  return <div ref={rootRef}>
    <div className="relative">
      <input
        ref={inputRef}
        id={id}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        value={display}
        placeholder="5:30 PM"
        autoComplete="off"
        inputMode="text"
        className="field-control pr-11 text-sm"
        onChange={(event) => setDraft(event.target.value)}
        onFocus={(event) => event.currentTarget.select()}
        onBlur={() => requestAnimationFrame(() => {
          if (rootRef.current?.contains(document.activeElement)) return;
          commitTypedValue();
        })}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" && !open) {
            event.preventDefault();
            setOpen(true);
            return;
          }
          if (event.key !== "Enter") return;
          event.preventDefault();
          commitTypedValue();
        }}
      />
      <button
        type="button"
        aria-label={`${open ? "Hide" : "Show"} the ${ariaLabel.toLowerCase()} picker`}
        aria-expanded={open}
        className="absolute right-1 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-lg text-[var(--muted-foreground)] transition-colors hover:bg-[var(--primary-soft)] hover:text-[var(--primary)]"
        onPointerDown={(event) => {
          event.preventDefault();
          commitTypedValue();
          setOpen((current) => !current);
        }}
      >
        <ChevronDown className={cn("size-4 transition-transform duration-200", open && "rotate-180")} />
      </button>
    </div>
    {open && <TimeWheel value={wheelValue || fallback} onChange={(time) => { setDraft(null); onChange(time); }} label={ariaLabel} onDone={() => dismiss(true)} />}
  </div>;
}
