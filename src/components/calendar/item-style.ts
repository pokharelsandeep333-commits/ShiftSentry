import type { CSSProperties } from "react";
import type { CalendarItem } from "@/lib/calendar-layout";
import { cn } from "@/lib/utils";

/**
 * One look for a calendar item everywhere it is drawn: a shift is a solid block
 * in its job's colour, a Google event a tinted outline in its calendar's colour,
 * and either one ringed amber when a shift and an event overlap.
 */
export function itemClass(item: CalendarItem) {
  return cn(
    "block overflow-hidden rounded-lg px-1.5 py-1 text-[11px] font-semibold leading-tight",
    item.kind === "shift" ? "text-white shadow-sm" : "border text-[var(--foreground)]",
    item.overlap && "ring-2 ring-[var(--warning)] ring-offset-1 ring-offset-[var(--card)]",
  );
}

export function itemStyle(item: CalendarItem): CSSProperties {
  return item.kind === "shift" ? { backgroundColor: item.color } : { borderColor: item.color, backgroundColor: `color-mix(in srgb, ${item.color} 14%, var(--card))` };
}
