"use client";

import { cn } from "@/lib/utils";

export function Progress({ value, className, indicatorClassName }: { value: number; className?: string; indicatorClassName?: string }) {
  const progress = Math.min(100, Math.max(0, value)) / 100;

  return <div className={cn("h-2.5 w-full overflow-hidden rounded-full bg-[var(--surface-subtle)] shadow-inner", className)}>
    <div
      className={cn("h-full rounded-full bg-[var(--primary)]", indicatorClassName)}
      style={{ width: `${progress * 100}%` }}
    />
  </div>;
}
