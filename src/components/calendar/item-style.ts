import type { CSSProperties } from "react";
import { formatInTimeZone } from "date-fns-tz";
import type { CalendarItem } from "@/lib/calendar-layout";
import { cn } from "@/lib/utils";

/**
 * One look for a calendar item everywhere it is drawn: a shift is a solid block
 * in its job's colour, a Google event a tinted outline in its calendar's colour,
 * and either one ringed amber when a shift and an event overlap.
 */
export function itemClass(item: CalendarItem) {
  return cn(
    "block overflow-hidden rounded-md px-1.5 py-1 text-xs font-semibold leading-tight",
    item.kind === "shift" ? "shadow-sm" : "border text-[var(--foreground)]",
    item.overlap && "ring-2 ring-[var(--warning)] ring-offset-1 ring-offset-[var(--card)]",
  );
}

/**
 * White on a dark job colour, ink on a light one (mint, yellow): a fixed white
 * label fails contrast on half the palette. Job colours are a checked
 * `#rrggbb` (jobs.color), so the parse cannot meet anything else; the cutoff is
 * where ink and white have equal WCAG contrast against the colour.
 */
export function textOn(hex: string) {
  const channel = (offset: number) => {
    const value = parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const luminance = 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
  return luminance > 0.179 ? "#121826" : "#ffffff";
}

export function itemStyle(item: CalendarItem): CSSProperties {
  return item.kind === "shift" ? { backgroundColor: item.color, color: textOn(item.color) } : { borderColor: item.color, backgroundColor: `color-mix(in srgb, ${item.color} 14%, var(--card))` };
}

/** Google's compact clock: "8", "10:30", with the meridiem separate. */
function clock(iso: string, timeZone: string) {
  const minutes = formatInTimeZone(iso, timeZone, "mm");
  return { text: formatInTimeZone(iso, timeZone, minutes === "00" ? "h" : "h:mm"), meridiem: formatInTimeZone(iso, timeZone, "aaa") };
}

/** "4pm", "10:45am". */
export function shortTime(iso: string, timeZone: string) {
  const { text, meridiem } = clock(iso, timeZone);
  return `${text}${meridiem}`;
}

/** "8 – 10:30am", or "10:45am – 1:45pm" across noon. */
export function timeRange(startsAt: string, endsAt: string, timeZone: string) {
  const start = clock(startsAt, timeZone);
  const end = clock(endsAt, timeZone);
  return start.meridiem === end.meridiem ? `${start.text} – ${end.text}${end.meridiem}` : `${start.text}${start.meridiem} – ${end.text}${end.meridiem}`;
}
