"use client";

import { useSyncExternalStore, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";
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
export function WeekDisclosure({ weekKey, defaultOpen, summary, children, current = false }: { weekKey: string; defaultOpen: boolean; summary: ReactNode; children: ReactNode; current?: boolean }) {
  const [open, setOpen] = useWeekOpen(weekKey, defaultOpen);

  return <details open={open} onToggle={(event) => setOpen(event.currentTarget.open)} className={`shift-week group ${current ? "current-week" : ""}`}>
    <summary>{summary}<ChevronDown className="week-chevron" size={19} aria-hidden="true" /></summary>
    {children}
  </details>;
}

/**
 * Opens or closes every week on the page at once. It writes the same
 * remembered store each week reads, so the weeks follow without being told.
 * Reads as "Collapse all" only when every listed week is open.
 */
export function ExpandAllWeeks({ weeks }: { weeks: { key: string; defaultOpen: boolean }[] }) {
  const stored = useSyncExternalStore(openWeeks.subscribe, openWeeks.read, openWeeks.serverSnapshot);
  if (weeks.length < 2) return null;
  const allOpen = weeks.every((week) => stored[week.key] ?? week.defaultOpen);
  function setAll(open: boolean) {
    const next = { ...stored };
    for (const week of weeks) next[week.key] = open;
    openWeeks.write(keepNewestKeys(next, REMEMBERED_WEEKS));
  }
  return <button type="button" onClick={() => setAll(!allOpen)} className="press inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-xs font-semibold text-[var(--muted-foreground)] outline-none hover:bg-[var(--surface-subtle)] hover:text-[var(--foreground)] focus-visible:ring-4 focus-visible:ring-[var(--primary-soft)]">
    <ChevronDown className={allOpen ? "size-3.5 rotate-180" : "size-3.5"} aria-hidden="true" />
    {allOpen ? "Collapse all" : "Expand all"}
  </button>;
}
