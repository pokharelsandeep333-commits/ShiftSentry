import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { FitList } from "@/components/calendar/fit-list";
import { itemClass, itemStyle, shortTime } from "@/components/calendar/item-style";
import { itemsOnDay, type CalendarItem } from "@/lib/calendar-layout";
import { longDayLabel } from "@/lib/calendar-range";
import { cn } from "@/lib/utils";

const weekdayLabel = (day: string) => formatInTimeZone(`${day}T12:00:00.000Z`, "UTC", "EEE");

/**
 * Whole weeks around the month, stretched to the height the page gives it.
 * Each day lists as many items as its row holds (FitList), timed ones led by
 * their start, and "+N more" opens that day's week.
 */
export function MonthGrid({ days, today, month, items, timeZone }: { days: string[]; today: string; month: string; items: CalendarItem[]; timeZone: string }) {
  const weeks = Math.ceil(days.length / 7);
  return <div className="grid h-full min-h-0 overflow-hidden rounded-2xl border bg-[var(--card)]" style={{ gridTemplateRows: `auto repeat(${weeks}, minmax(0, 1fr))` }}>
    <div className="grid grid-cols-7 border-b">{days.slice(0, 7).map((day, index) => <p key={day} className={cn("py-2 text-center text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--muted-foreground)]", index > 0 && "border-l")}>{weekdayLabel(day)}</p>)}</div>
    {Array.from({ length: weeks }, (_, week) => <div key={week} className={cn("grid min-h-0 grid-cols-7", week < weeks - 1 && "border-b")}>
      {days.slice(week * 7, week * 7 + 7).map((day, index) => {
        const dayItems = itemsOnDay(items, day, timeZone);
        const inMonth = day.slice(0, 7) === month;
        const isToday = day === today;
        return <div key={day} className={cn("flex min-h-0 min-w-0 flex-col overflow-hidden px-1 pb-1 pt-1", index > 0 && "border-l", !inMonth && "bg-[var(--surface-subtle)]")}>
          <Link href={`/calendar?view=week&date=${day}`} prefetch={false} aria-label={`${longDayLabel(day)}${isToday ? ", today" : ""}, open week`} className={cn("mx-auto grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold tabular-nums transition-colors", isToday ? "bg-[var(--primary)] text-[var(--primary-foreground)]" : inMonth ? "hover:bg-[var(--surface-subtle)]" : "text-[var(--muted-foreground)] hover:bg-[var(--card)]")}>{Number(day.slice(8))}</Link>
          <FitList moreHref={`/calendar?view=week&date=${day}`}>
            {dayItems.map((item) => {
              const text = <span className="block truncate">{item.importJob ? "+ " : ""}{!item.allDay && <span className="font-normal opacity-90">{shortTime(item.startsAt, timeZone)} </span>}{item.title}</span>;
              const target = item.href ?? item.importHref;
              return target
                ? <Link key={item.key} href={target} prefetch={false} title={item.importJob ? `Add as a ${item.importJob} shift` : item.title} className={cn(itemClass(item), "py-0.5 transition-[filter] hover:brightness-[1.04]")} style={itemStyle(item)}>{text}</Link>
                : <span key={item.key} title={item.title} className={cn(itemClass(item), "py-0.5")} style={itemStyle(item)}>{text}</span>;
            })}
          </FitList>
        </div>;
      })}
    </div>)}
  </div>;
}
