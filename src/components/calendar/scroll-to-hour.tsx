"use client";

import { useEffect, useRef, type ReactNode } from "react";

/** Opens the week grid at a working hour instead of midnight. */
export function ScrollToHour({ hour, hourHeight, children, className }: { hour: number; hourHeight: number; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => { if (ref.current) ref.current.scrollTop = hour * hourHeight; }, [hour, hourHeight]);
  return <div ref={ref} className={className}>{children}</div>;
}
