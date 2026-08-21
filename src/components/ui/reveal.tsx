"use client";

import type { ReactNode } from "react";
import { motion, useReducedMotion } from "motion/react";
import { cn } from "@/lib/utils";

export function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const reduceMotion = useReducedMotion();

  return <motion.div
    className={cn(className)}
    initial={{ opacity: 0, y: 18, scale: 0.992 }}
    whileInView={{ opacity: 1, y: 0, scale: 1 }}
    viewport={{ once: true, amount: 0.16 }}
    transition={{ duration: reduceMotion ? 0 : 0.42, delay: reduceMotion ? 0 : delay, ease: [0.16, 1, 0.3, 1] }}
  >
    {children}
  </motion.div>;
}
