import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Whole hours and the leftover minutes, for displays that style the two differently. */
export function splitMinutes(minutes: number) {
  const safeMinutes = Math.max(0, Math.round(minutes));
  return { hours: Math.floor(safeMinutes / 60), minutes: safeMinutes % 60 };
}

export function formatMinutes(minutes: number) {
  const parts = splitMinutes(minutes);
  return parts.minutes === 0 ? `${parts.hours}h` : `${parts.hours}h ${parts.minutes}m`;
}

/**
 * Decimal hours, one decimal place. Lossy on purpose -- 18h 1m reads as "18.0"
 * -- so it belongs only where space forces a compact number and being a minute
 * out cannot mislead, i.e. chart axis ticks. Anything a viewer might compare
 * against a cap should use formatMinutes instead.
 */
export function formatHours(minutes: number) {
  return (Math.max(0, minutes) / 60).toFixed(minutes % 60 === 0 ? 0 : 1);
}
