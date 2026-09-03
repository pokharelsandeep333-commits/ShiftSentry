"use client";

import { useCallback, useEffect, useRef } from "react";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Row height in px. Kept in JS because every scroll offset is derived from it. */
const ROW_HEIGHT = 36;
/** Odd, so exactly one row sits under the selection bar. */
const VISIBLE_ROWS = 5;
const PAD_ROWS = (VISIBLE_ROWS - 1) / 2;
/** A looping wheel renders its items this many times and recentres once motion stops. */
const REPEATS = 5;
/** Rows further than this from the centre are behind the mask, so they are not styled. */
const FADE_ROWS = 3;
/** Silence after the last scroll event, by which point the snap animation has finished. */
const SETTLE_MS = 120;

const HOURS = Array.from({ length: 12 }, (_, index) => String(index + 1));
const MINUTES = Array.from({ length: 60 }, (_, index) => String(index).padStart(2, "0"));
const MERIDIEMS = ["AM", "PM"];

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function wrapIndex(index: number, length: number) {
  return ((index % length) + length) % length;
}

type WheelProps = {
  items: string[];
  value: string;
  onChange: (value: string) => void;
  label: string;
  loop?: boolean;
  className?: string;
};

/**
 * One column of an iOS-style picker: a snap-scrolling list under a fixed centre
 * line. Selection follows the scroll position rather than a click, so a flick
 * decelerates, snaps, and commits whatever it landed on.
 */
function Wheel({ items, value, onChange, label, loop = false, className }: WheelProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const rowsRef = useRef<HTMLDivElement>(null);
  const settleTimerRef = useRef<number | undefined>(undefined);
  const frameRef = useRef<number | undefined>(undefined);
  // Set while the component moves the wheel itself, so a programmatic jump is
  // never mistaken for the user choosing a value.
  const silentRef = useRef(false);

  const rendered = loop ? Array.from({ length: REPEATS }, () => items).flat() : items;
  const baseOffset = loop ? items.length * Math.floor(REPEATS / 2) : 0;
  const selectedIndex = Math.max(0, items.indexOf(value));

  // Fade and shrink the rows either side of the centre. Bounded to the handful
  // of rows the mask actually shows, so a 300-row minute wheel stays cheap.
  const paint = useCallback(() => {
    const scroller = scrollRef.current;
    const rows = rowsRef.current;
    if (!scroller || !rows) return;

    const centre = scroller.scrollTop / ROW_HEIGHT;
    const first = Math.max(0, Math.floor(centre) - FADE_ROWS);
    const last = Math.min(rows.children.length - 1, Math.ceil(centre) + FADE_ROWS);

    for (let index = first; index <= last; index += 1) {
      const row = rows.children[index] as HTMLElement | undefined;
      if (!row) continue;
      const distance = Math.min(Math.abs(index - centre), FADE_ROWS);
      row.style.opacity = String(1 - distance * 0.26);
      row.style.transform = `scale(${1 - distance * 0.07})`;
    }
  }, []);

  const schedulePaint = useCallback(() => {
    if (frameRef.current !== undefined) return;
    frameRef.current = requestAnimationFrame(() => {
      frameRef.current = undefined;
      paint();
    });
  }, [paint]);

  const scrollToIndex = useCallback((index: number) => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    silentRef.current = true;
    scroller.scrollTop = index * ROW_HEIGHT;
    requestAnimationFrame(() => {
      silentRef.current = false;
      paint();
    });
  }, [paint]);

  const settle = useCallback(() => {
    const scroller = scrollRef.current;
    if (!scroller || silentRef.current) return;

    const index = Math.round(scroller.scrollTop / ROW_HEIGHT);
    const normalized = wrapIndex(index, items.length);
    // Recentring after the wheel has stopped keeps the jump invisible; doing it
    // mid-flick would fight the momentum.
    if (loop && index !== baseOffset + normalized) scrollToIndex(baseOffset + normalized);
    if (items[normalized] !== value) onChange(items[normalized]);
  }, [baseOffset, items, loop, onChange, scrollToIndex, value]);

  function handleScroll() {
    schedulePaint();
    if (silentRef.current) return;
    window.clearTimeout(settleTimerRef.current);
    settleTimerRef.current = window.setTimeout(settle, SETTLE_MS);
  }

  function step(amount: number) {
    const next = loop ? wrapIndex(selectedIndex + amount, items.length) : Math.max(0, Math.min(selectedIndex + amount, items.length - 1));
    if (items[next] !== value) onChange(items[next]);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    const steps: Record<string, number> = { ArrowUp: -1, ArrowDown: 1, PageUp: -5, PageDown: 5 };
    if (event.key in steps) {
      event.preventDefault();
      step(steps[event.key]);
      return;
    }
    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      onChange(items[event.key === "Home" ? 0 : items.length - 1]);
    }
  }

  function handleClick(event: React.MouseEvent<HTMLDivElement>) {
    const row = (event.target as HTMLElement).closest<HTMLElement>("[data-item]");
    const item = row?.dataset.item;
    if (item && item !== value) onChange(item);
  }

  // Follow the value whenever it changes from outside — typing, a preset, or the
  // sibling wheels. A wheel already showing this value is left where it is so a
  // looping wheel does not snap back to the middle block under the user.
  useEffect(() => {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const current = wrapIndex(Math.round(scroller.scrollTop / ROW_HEIGHT), items.length);
    if (current === selectedIndex && scroller.scrollTop > 0) {
      paint();
      return;
    }
    scrollToIndex(baseOffset + selectedIndex);
  }, [baseOffset, items.length, paint, scrollToIndex, selectedIndex]);

  useEffect(() => () => {
    window.clearTimeout(settleTimerRef.current);
    if (frameRef.current !== undefined) cancelAnimationFrame(frameRef.current);
  }, []);

  return <div
    ref={scrollRef}
    role="spinbutton"
    tabIndex={0}
    aria-label={label}
    aria-valuenow={selectedIndex}
    aria-valuemin={0}
    aria-valuemax={items.length - 1}
    aria-valuetext={value}
    onScroll={handleScroll}
    onKeyDown={handleKeyDown}
    onClick={handleClick}
    className={cn(
      "relative z-10 snap-y snap-mandatory overflow-y-auto overscroll-contain outline-none [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
      "[mask-image:linear-gradient(to_bottom,transparent,black_26%,black_74%,transparent)]",
      "focus-visible:ring-2 focus-visible:ring-[var(--primary)] rounded-xl",
      className,
    )}
    style={{ height: VISIBLE_ROWS * ROW_HEIGHT }}
  >
    <div ref={rowsRef} style={{ paddingTop: PAD_ROWS * ROW_HEIGHT, paddingBottom: PAD_ROWS * ROW_HEIGHT }}>
      {rendered.map((item, index) => <div
        key={`${item}-${index}`}
        data-item={item}
        aria-hidden="true"
        className="grid snap-center cursor-pointer place-items-center text-[0.95rem] font-semibold tabular-nums transition-[color] duration-150"
        style={{ height: ROW_HEIGHT }}
      >
        {item}
      </div>)}
    </div>
  </div>;
}

type TimeWheelProps = {
  /** Always a valid "HH:mm" — the caller seeds a fallback when the field is empty. */
  value: string;
  onChange: (time: string) => void;
  label: string;
  /** Dismisses the wheel. Every scroll already committed, so this only closes. */
  onDone?: () => void;
};

export function TimeWheel({ value, onChange, label, onDone }: TimeWheelProps) {
  const [hours, minutes] = value.split(":").map(Number);
  const hour = String(hours % 12 || 12);
  const minute = pad(minutes);
  const meridiem = hours < 12 ? "AM" : "PM";

  function emit(nextHour: string, nextMinute: string, nextMeridiem: string) {
    const hour24 = (Number(nextHour) % 12) + (nextMeridiem === "PM" ? 12 : 0);
    onChange(`${pad(hour24)}:${nextMinute}`);
  }

  return <div className="mt-2 rounded-2xl border border-[color-mix(in_srgb,var(--primary)_18%,var(--border))] bg-[var(--surface-subtle)] px-2 pt-1">
    <div role="group" aria-label={label} className="relative">
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-1/2 -translate-y-1/2 rounded-xl bg-[var(--primary-soft)]" style={{ height: ROW_HEIGHT }} />
      <div className="relative grid grid-cols-[1fr_1fr_1fr] gap-1">
        <Wheel items={HOURS} value={hour} onChange={(next) => emit(next, minute, meridiem)} label={`${label} hour`} loop />
        <Wheel items={MINUTES} value={minute} onChange={(next) => emit(hour, next, meridiem)} label={`${label} minute`} loop />
        <Wheel items={MERIDIEMS} value={meridiem} onChange={(next) => emit(hour, minute, next)} label={`${label} AM or PM`} />
      </div>
    </div>
    {onDone && <div className="mt-1 flex justify-end border-t border-[color-mix(in_srgb,var(--border)_75%,transparent)] py-2">
      <Button type="button" size="sm" onClick={onDone}><Check className="size-3.5" />Done</Button>
    </div>}
  </div>;
}
