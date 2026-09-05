"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { createLocalPreference, keepNewestKeys } from "@/lib/local-preference";

type OpenWeeks = Record<string, boolean>;

/**
 * Only weeks the viewer has actually toggled are stored, so one entry per week
 * they touched rather than one per week that exists. Past this many the oldest
 * are dropped -- they sit far enough up the log that nobody scrolls back to
 * them, and the alternative is a record that grows for as long as the account
 * does.
 */
const REMEMBERED_WEEKS = 80;

function reviveOpenWeeks(parsed: unknown): OpenWeeks | null {
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
  const entries = Object.entries(parsed as Record<string, unknown>).filter(([, value]) => typeof value === "boolean");
  return Object.fromEntries(entries) as OpenWeeks;
}

const openWeeks = createLocalPreference<OpenWeeks>("shiftsentry:shift-weeks-open", {}, reviveOpenWeeks);

/**
 * Which week sections are expanded.
 *
 * The server cannot read localStorage, so it renders the old behaviour -- the
 * current week open, everything else shut -- and the remembered state arrives
 * on the first client render. A week whose stored state differs is therefore
 * open for one frame before it closes, which is the right way round: showing
 * content briefly beats hiding content briefly.
 */
function useWeekOpen(weekKey: string, defaultOpen: boolean): [boolean, (open: boolean) => void] {
  const stored = useSyncExternalStore(openWeeks.subscribe, openWeeks.read, openWeeks.serverSnapshot);
  const open = stored[weekKey] ?? defaultOpen;

  return [open, (next: boolean) => {
    if (next === open) return;
    openWeeks.write(keepNewestKeys({ ...stored, [weekKey]: next }, REMEMBERED_WEEKS));
  }];
}

/**
 * `<details>` stays the mechanism: the summary is focusable and toggles on
 * Enter/Space without any of it being written here. Only the open state is
 * lifted into React, and the shift rows are still passed in already rendered by
 * the server -- this component adds no client JS to the list itself.
 */
export function WeekDisclosure({ weekKey, defaultOpen, summary, children }: { weekKey: string; defaultOpen: boolean; summary: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useWeekOpen(weekKey, defaultOpen);

  return <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)} className="group">
    <summary className="flex cursor-pointer list-none items-center gap-3 rounded-2xl p-3 transition-colors hover:bg-[var(--surface-subtle)] [&::-webkit-details-marker]:hidden">
      <ChevronRight className="size-4 shrink-0 text-[var(--muted-foreground)] transition-transform duration-200 group-open:rotate-90" />
      {summary}
    </summary>
    <div className="mt-1 space-y-1">{children}</div>
  </details>;
}
