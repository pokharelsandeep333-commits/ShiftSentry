"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Reveal({ children, className }: { children: ReactNode; className?: string; delay?: number }) {
  return <div className={cn(className)}>{children}</div>;
}
