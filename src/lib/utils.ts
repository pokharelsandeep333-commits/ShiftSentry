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
