import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { itemClass, itemStyle } from "@/components/calendar/item-style";
import { itemsOnDay, type CalendarItem } from "@/lib/calendar-layout";
import { cn } from "@/lib/utils";

const weekdayLabel = (day: string) => formatInTimeZone(`${day}T12:00:00.000Z`, "UTC", "EEE");

/** Whole weeks around the month; each day shows three items and "+N more", which opens that day's week. */
export function MonthGrid({ days, today, month, items, timeZone }: { days: string[]; today: string; month: string; items: CalendarItem[]; timeZone: string }) {
  return <div className="overflow-hidden rounded-2xl border bg-[var(--card)]">
    <div className="grid grid-cols-7 border-b">{days.slice(0, 7).map((day) => <p key={day} className="px-2 py-2 text-xs font-semibold text-[var(--muted-foreground)]">{weekdayLabel(day)}</p>)}</div>
    <div className="grid grid-cols-7">
      {days.map((day, index) => {
        const dayItems = itemsOnDay(items, day, timeZone);
        const inMonth = day.slice(0, 7) === month;
        return <div key={day} className={cn("min-h-28 min-w-0 border-b p-1.5", index % 7 !== 0 && "border-l", !inMonth && "bg-[var(--surface-subtle)]")}>
          <Link href={`/calendar?view=week&date=${day}`} aria-label={formatInTimeZone(`${day}T12:00:00.000Z`, "UTC", "EEEE, MMMM d")} className={cn("inline-grid size-7 place-items-center rounded-full text-xs font-semibold transition-colors", day === today ? "bg-[var(--primary)] text-[var(--primary-foreground)]" : inMonth ? "hover:bg-[var(--surface-subtle)]" : "text-[var(--muted-foreground)]")}>{Number(day.slice(8))}</Link>
          <div className="mt-1 space-y-1">
            {dayItems.slice(0, 3).map((item) => (item.href ?? item.importHref)
              ? <Link key={item.key} href={(item.href ?? item.importHref)!} title={item.importJob ? `Add as a ${item.importJob} shift` : undefined} className={itemClass(item)} style={itemStyle(item)}><span className="block truncate">{item.importJob ? "+ " : ""}{item.title}</span></Link>
              : <span key={item.key} className={itemClass(item)} style={itemStyle(item)}><span className="block truncate">{item.title}</span></span>)}
            {dayItems.length > 3 && <Link href={`/calendar?view=week&date=${day}`} className="block px-1 text-[11px] font-semibold text-[var(--muted-foreground)] hover:text-[var(--foreground)]">+{dayItems.length - 3} more</Link>}
          </div>
        </div>;
      })}
    </div>
  </div>;
}
