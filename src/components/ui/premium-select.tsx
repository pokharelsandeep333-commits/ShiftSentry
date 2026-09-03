"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDismissable } from "@/components/ui/use-dismissable";

export type SelectOption = { value: string; label: string };

type PremiumSelectProps = {
  name: string;
  defaultValue: string;
  options: SelectOption[];
  labelledBy: string;
  required?: boolean;
  className?: string;
  /** Optional: mirror the selection into React state. */
  onValueChange?: (value: string) => void;
};

/** How long consecutive keystrokes keep building one typeahead query. */
const TYPEAHEAD_RESET_MS = 500;
/** Panel height cap, matched to `max-h-64`, used to decide whether to drop upwards. */
const PANEL_MAX_HEIGHT = 256;

/**
 * An ARIA listbox rather than Radix Select, and deliberately so.
 *
 * Radix Select mounts a portal, starts a floating-ui `autoUpdate`, locks body
 * scroll through react-remove-scroll, aria-hides every sibling and installs
 * focus guards -- on every open. Measured on `/shifts/new` in a production
 * build, opening this three-option select cost a 162ms worst frame and 1531ms
 * of stalled frames over eight open/close cycles, while the in-house calendar
 * popover next to it -- 42 day buttons, roughly fifteen times the DOM -- cost
 * 39ms and 327ms in the same run.
 *
 * This keeps the same props, look, and keyboard contract (arrows, Home/End,
 * typeahead, Enter/Space, Escape, focus return) without any of that machinery.
 * The value reaches the form through a hidden input, exactly as Radix's own
 * hidden control did.
 */
export function PremiumSelect({ name, defaultValue, options, labelledBy, required = false, className, onValueChange }: PremiumSelectProps) {
  const reactId = useId();
  const triggerId = `${reactId}-trigger`;
  const listboxId = `${reactId}-listbox`;
  const optionId = (index: number) => `${reactId}-option-${index}`;

  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const typeaheadRef = useRef({ query: "", timer: undefined as number | undefined });

  const [value, setValue] = useState(defaultValue);
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const [dropUp, setDropUp] = useState(false);

  const selectedIndex = options.findIndex((option) => option.value === value);
  const selectedLabel = options[selectedIndex]?.label ?? "";

  const dismiss = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  useDismissable(open, rootRef, dismiss);

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>("[data-active]")?.scrollIntoView({ block: "nearest" });
  }, [activeIndex, open]);

  useEffect(() => () => window.clearTimeout(typeaheadRef.current.timer), []);

  function openList() {
    setActiveIndex(selectedIndex === -1 ? 0 : selectedIndex);
    // Flip upwards only when below genuinely cannot hold the panel and above can
    // hold more, so the common case stays anchored under the trigger.
    const rect = triggerRef.current?.getBoundingClientRect();
    if (rect) {
      const below = window.innerHeight - rect.bottom;
      setDropUp(below < Math.min(PANEL_MAX_HEIGHT, options.length * 44 + 16) && rect.top > below);
    }
    setOpen(true);
  }

  function commit(index: number) {
    const option = options[index];
    if (!option) return;
    setValue(option.value);
    onValueChange?.(option.value);
    dismiss(true);
  }

  function moveActive(next: number) {
    setActiveIndex(Math.max(0, Math.min(next, options.length - 1)));
  }

  function runTypeahead(key: string) {
    const state = typeaheadRef.current;
    window.clearTimeout(state.timer);
    state.query += key.toLowerCase();
    state.timer = window.setTimeout(() => { state.query = ""; }, TYPEAHEAD_RESET_MS);
    const match = options.findIndex((option) => option.label.toLowerCase().startsWith(state.query));
    if (match !== -1) setActiveIndex(match);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLButtonElement>) {
    if (!open) {
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
      event.preventDefault();
      openList();
      return;
    }

    const steps: Record<string, number> = { ArrowDown: 1, ArrowUp: -1, PageDown: 5, PageUp: -5 };
    if (event.key in steps) {
      event.preventDefault();
      moveActive(activeIndex + steps[event.key]);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      moveActive(event.key === "Home" ? 0 : options.length - 1);
      return;
    }
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      commit(activeIndex);
      return;
    }
    if (event.key === "Tab") {
      setOpen(false);
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      dismiss(true);
      return;
    }
    if (event.key.length === 1 && !event.metaKey && !event.ctrlKey && !event.altKey) {
      event.preventDefault();
      runTypeahead(event.key);
    }
  }

  return <div ref={rootRef} className="relative">
    <input type="hidden" name={name} value={value} />
    <button
      ref={triggerRef}
      id={triggerId}
      type="button"
      role="combobox"
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-controls={open ? listboxId : undefined}
      aria-activedescendant={open ? optionId(activeIndex) : undefined}
      aria-labelledby={`${labelledBy} ${triggerId}`}
      aria-required={required || undefined}
      className={cn("field-control group flex items-center justify-between gap-3 text-left text-sm font-medium", !selectedLabel && "text-[var(--muted-foreground)]", className)}
      onClick={() => (open ? dismiss(false) : openList())}
      onKeyDown={handleKeyDown}
    >
      <span className="truncate">{selectedLabel}</span>
      <span aria-hidden="true" className="grid size-6 shrink-0 place-items-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary)]">
        <ChevronDown className={cn("size-4 transition-transform duration-300", open && "rotate-180")} />
      </span>
    </button>
    {open && <div
      ref={listRef}
      id={listboxId}
      role="listbox"
      aria-labelledby={labelledBy}
      className={cn(
        "absolute inset-x-0 z-50 max-h-64 overflow-y-auto overscroll-contain rounded-[1.15rem] border border-[color-mix(in_srgb,var(--primary)_24%,var(--border))] bg-[var(--card)] p-1.5 text-[var(--foreground)] shadow-2xl shadow-black/20 outline-none",
        "animate-[select-in_220ms_cubic-bezier(0.16,1,0.3,1)]",
        dropUp ? "bottom-full mb-2" : "top-full mt-2",
      )}
    >
      {options.map((option, index) => {
        const isSelected = option.value === value;
        const isActive = index === activeIndex;
        return <div
          key={option.value}
          id={optionId(index)}
          role="option"
          aria-selected={isSelected}
          data-active={isActive ? "" : undefined}
          className={cn(
            "relative flex cursor-pointer select-none items-center rounded-xl py-2.5 pl-3 pr-9 text-sm font-medium transition-colors",
            isActive && "bg-[var(--primary-soft)] text-[var(--primary)]",
            isSelected && !isActive && "bg-[var(--primary-soft)]",
          )}
          onPointerEnter={() => setActiveIndex(index)}
          onPointerDown={(event) => event.preventDefault()}
          onClick={() => commit(index)}
        >
          {option.label}
          {isSelected && <span className="absolute right-3 inline-flex items-center text-[var(--primary)]"><Check className="size-4" strokeWidth={2.5} /></span>}
        </div>;
      })}
    </div>}
  </div>;
}
