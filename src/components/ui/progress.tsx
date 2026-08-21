"use client";

import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

export function Progress({ value, className, indicatorClassName }: { value: number; className?: string; indicatorClassName?: string }) {
  const reduceMotion = useReducedMotion();
  const progress = Math.min(100, Math.max(0, value)) / 100;

  return <div className={cn("h-2.5 w-full overflow-hidden rounded-full bg-[var(--surface-subtle)] shadow-inner", className)}>
    <motion.div
      className={cn("h-full rounded-full bg-[var(--primary)]", indicatorClassName)}
      initial={{ scaleX: 0 }}
      animate={{ scaleX: progress }}
      transition={{ duration: reduceMotion ? 0 : 0.7, delay: reduceMotion ? 0 : 0.12, ease: [0.16, 1, 0.3, 1] }}
      style={{ transformOrigin: "left" }}
    />
  </div>;
}
