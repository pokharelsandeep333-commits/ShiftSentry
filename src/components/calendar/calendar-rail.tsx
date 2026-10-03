import Link from "next/link";
import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import { MiniMonth } from "@/components/calendar/mini-month";
import type { CalendarLegendEntry } from "@/lib/calendar-page-data";
import type { CalendarRange } from "@/lib/calendar-range";

function Legend({ title, entries, outlined }: { title: string; entries: CalendarLegendEntry[]; outlined?: boolean }) {
  if (entries.length === 0) return null;
  return <section>
    <h2 className="px-2 text-xs font-semibold text-[var(--muted-foreground)]">{title}</h2>
    <ul className="mt-1 space-y-0.5">
      {entries.map((entry) => <li key={entry.id} className="flex min-w-0 items-center gap-2.5 rounded-lg px-2 py-1 text-[13px]">
        <span aria-hidden="true" className="size-3 shrink-0 rounded-[4px]" style={outlined ? { border: `2px solid ${entry.color}`, backgroundColor: `color-mix(in srgb, ${entry.color} 14%, var(--card))` } : { backgroundColor: entry.color }} />
        <span className="truncate">{entry.name}</span>
      </li>)}
    </ul>
  </section>;
}

/**
 * The calendar's left column, after Google Calendar's: a create button, a
 * month picker, and what each colour means. Desktop-wide screens only; the
 * page decides where it shows.
 */
export function CalendarRail({ range, weekStartsOn, jobs, calendars, note }: { range: CalendarRange; weekStartsOn: number; jobs: CalendarLegendEntry[]; calendars: CalendarLegendEntry[]; note?: ReactNode }) {
  return <div className="flex min-h-0 flex-col gap-5 overflow-y-auto pb-2 pr-1">
    <Link href="/shifts/new" className="inline-flex h-10 w-fit items-center gap-2 rounded-full border bg-[var(--card)] pl-3.5 pr-5 text-sm font-semibold shadow-[0_1px_2px_rgb(16_24_40/0.06),0_10px_24px_-16px_rgb(16_24_40/0.35)] transition-[box-shadow,background-color] duration-200 hover:bg-[var(--primary-soft)] hover:shadow-[0_1px_3px_rgb(16_24_40/0.08),0_14px_30px_-16px_rgb(16_24_40/0.4)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--primary-soft)]">
      <Plus className="size-4 text-[var(--primary)]" strokeWidth={2.5} />Add shift
    </Link>
    <MiniMonth key={range.anchor.slice(0, 7)} anchor={range.anchor} today={range.today} view={range.view} weekStartsOn={weekStartsOn} selectedDays={range.view === "week" ? range.days : []} />
    <Legend title="My jobs" entries={jobs} />
    <Legend title="Google calendars" entries={calendars} outlined />
    {note && <p className="px-2 text-xs leading-5 text-[var(--muted-foreground)]">{note}</p>}
  </div>;
}
