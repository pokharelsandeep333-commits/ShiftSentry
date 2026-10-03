"use client";

import { Children, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";

const GAP = 2; // space-y-0.5

/**
 * A month cell's items, as many as its height holds, then "+N more". Row height
 * follows the window (the month grid fills the screen), so the count cannot be
 * fixed on the server. Items are one line each, so the first one's height
 * measures them all. The server renders every item and the cell clips them;
 * the first measurement trims to whole items, and a resize re-measures.
 */
export function FitList({ children, moreHref }: { children: ReactNode; moreHref: string }) {
  const items = Children.toArray(children);
  const total = items.length;
  const box = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(total);
  const itemHeight = useRef(0);

  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const measure = () => {
      // Remembered, because a cell short enough to show no item has none to measure.
      const first = element.querySelector<HTMLElement>("[data-fit-item]");
      if (first) itemHeight.current = first.offsetHeight + GAP;
      if (!itemHeight.current) return;
      const available = element.clientHeight + GAP;
      if (total * itemHeight.current <= available) { setFit(total); return; }
      // Leave a row for "+N more", which is shorter than an item.
      setFit(Math.max(0, Math.floor((available - 16) / itemHeight.current)));
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [total]);

  return <div ref={box} className="mt-0.5 min-h-0 flex-1 space-y-0.5 overflow-hidden">
    {items.slice(0, fit).map((item, index) => <div key={index} data-fit-item>{item}</div>)}
    {fit < total && <Link href={moreHref} prefetch={false} className="block truncate rounded-md px-1.5 text-[11px] font-semibold leading-4 text-[var(--muted-foreground)] hover:bg-[var(--surface-subtle)] hover:text-[var(--foreground)]">+{total - fit} more</Link>}
  </div>;
}
