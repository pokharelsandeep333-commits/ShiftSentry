"use client";

import type { CSSProperties, FocusEvent, KeyboardEvent, ReactNode } from "react";
import { moveInGrid, type GridKey } from "@/lib/calendar-quick-add";

const KEYS = new Set<string>(["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Home", "End"]);

const cellOf = (element: HTMLElement) => ({ col: Number(element.dataset.col), row: Number(element.dataset.row) });

/**
 * One tab stop for a calendar's quick-add slots (roving tabindex). The server
 * renders every `[data-slot]` link with `tabIndex={-1}` except one; Tab reaches
 * that one, the arrows move between slots (`moveInGrid`), Enter follows the
 * link. Whichever slot gets focus, by key or click, becomes the tab stop, so
 * Tab out and back returns to it. Shift blocks and other links inside keep
 * their own place in the tab order.
 */
export function SlotKeys({ children, className, style }: { children: ReactNode; className?: string; style?: CSSProperties }) {
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (!KEYS.has(event.key) || event.altKey || event.ctrlKey || event.metaKey) return;
    const from = (event.target as HTMLElement).closest<HTMLElement>("[data-slot]");
    if (!from) return;
    const slots = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("[data-slot]"));
    const target = moveInGrid(slots.map(cellOf), cellOf(from), event.key as GridKey);
    event.preventDefault();
    if (!target) return;
    slots.find((slot) => slot.dataset.col === String(target.col) && slot.dataset.row === String(target.row))?.focus();
  }

  function onFocus(event: FocusEvent<HTMLDivElement>) {
    const slot = (event.target as HTMLElement).closest<HTMLElement>("[data-slot]");
    if (!slot || slot.tabIndex === 0) return;
    for (const other of event.currentTarget.querySelectorAll<HTMLElement>("[data-slot][tabindex='0']")) other.tabIndex = -1;
    slot.tabIndex = 0;
    slot.scrollIntoView({ block: "nearest", inline: "nearest" });
  }

  return <div className={className} style={style} onKeyDown={onKeyDown} onFocus={onFocus}>{children}</div>;
}
