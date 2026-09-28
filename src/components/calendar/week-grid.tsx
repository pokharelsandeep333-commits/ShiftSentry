import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { itemClass, itemStyle } from "@/components/calendar/item-style";
import { ScrollToHour } from "@/components/calendar/scroll-to-hour";
import { itemsOnDay, layoutDay, type CalendarItem } from "@/lib/calendar-layout";
import { addLocalDays } from "@/lib/calendar-range";
import { cn } from "@/lib/utils";

const HOUR = 48;
const hours = Array.from({ length: 24 }, (_, hour) => hour);
const pad = (hour: number) => String(hour).padStart(2, "0");
const dayLabel = (day: string) => formatInTimeZone(`${day}T12:00:00.000Z`, "UTC", "EEE d");
const hourLabel = (hour: number) => formatInTimeZone(`2026-01-01T${pad(hour)}:00:00.000Z`, "UTC", "h a");

/** An empty hour opens Add shift for that hour. Pointer-only: the page's "Add shift" button is the keyboard path. */
function newShiftHref(day: string, hour: number) {
  const end = hour === 23 ? `${addLocalDays(day, 1)}T00:00` : `${day}T${pad(hour + 1)}:00`;
  return `/shifts/new?startsAt=${day}T${pad(hour)}:00&endsAt=${end}`;
}

export function WeekGrid({ days, today, items, timeZone }: { days: string[]; today: string; items: CalendarItem[]; timeZone: string }) {
  const time = (iso: string) => formatInTimeZone(iso, timeZone, "h:mm");
  return <div className="overflow-hidden rounded-2xl border bg-[var(--card)]">
    <div className="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))] border-b">
      <div />
      {days.map((day) => <div key={day} className="min-w-0 border-l px-2 py-2">
        <p className={cn("text-xs font-semibold", day === today ? "text-[var(--primary)]" : "text-[var(--muted-foreground)]")}>{dayLabel(day)}</p>
        <div className="mt-1 space-y-1">
          {itemsOnDay(items, day, timeZone).filter((item) => item.allDay).map((item) => <span key={item.key} className={itemClass(item)} style={itemStyle(item)} title={item.title}><span className="block truncate">{item.title}</span></span>)}
        </div>
      </div>)}
    </div>
    <ScrollToHour hour={7} hourHeight={HOUR} className="max-h-[65vh] overflow-y-auto">
      <div className="grid grid-cols-[3.5rem_repeat(7,minmax(0,1fr))]" style={{ height: 24 * HOUR }}>
        <div>{hours.map((hour) => <div key={hour} className="-mt-1.5 pr-2 text-right text-[10px] text-[var(--muted-foreground)]" style={{ height: HOUR }}>{hour === 0 ? "" : hourLabel(hour)}</div>)}</div>
        {days.map((day) => <div key={day} className={cn("relative min-w-0 border-l", day === today && "bg-[var(--primary-soft)]")}>
          {hours.map((hour) => <Link key={hour} href={newShiftHref(day, hour)} tabIndex={-1} aria-hidden="true" className="block border-t border-[color-mix(in_srgb,var(--border)_60%,transparent)] transition-colors hover:bg-[var(--surface-subtle)]" style={{ height: HOUR }} />)}
          {layoutDay(items, day, timeZone).map(({ item, top, height, lane, lanes }) => {
            const style = { ...itemStyle(item), top: (top / 60) * HOUR, height: Math.max(20, (height / 60) * HOUR - 2), left: `calc(${(lane / lanes) * 100}% + 2px)`, width: `calc(${100 / lanes}% - 4px)` };
            const body = <><span className="block truncate">{item.title}</span><span className="block truncate font-normal opacity-80">{time(item.startsAt)}–{time(item.endsAt)}</span></>;
            return item.href
              ? <Link key={item.key} href={item.href} className={cn(itemClass(item), "absolute z-10")} style={style}>{body}</Link>
              : <div key={item.key} className={cn(itemClass(item), "absolute z-10")} style={style}>{body}</div>;
          })}
        </div>)}
      </div>
    </ScrollToHour>
  </div>;
}
