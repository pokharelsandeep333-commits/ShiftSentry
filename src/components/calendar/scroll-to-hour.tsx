"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Opens the week grid at a working hour instead of midnight. The grid is
 * hidden below `lg`, and a hidden element ignores `scrollTop`, so this waits
 * for the scroller to have a height -- first paint, or a window widened past
 * `lg` -- and scrolls once; after that the viewer's own scrolling is left alone.
 * The hour's height is CSS (it follows the grid's height), so it is measured
 * from the first hour row rather than passed in.
 */
export function ScrollToHour({ hour, children, className }: { hour: number; children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new ResizeObserver(() => {
      const row = element.querySelector<HTMLElement>("[data-hour-row]");
      if (element.clientHeight === 0 || !row) return;
      element.scrollTop = hour * row.offsetHeight;
      observer.disconnect();
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [hour]);
  return <div ref={ref} className={className}>{children}</div>;
}
