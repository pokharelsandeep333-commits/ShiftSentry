import Link from "next/link";
import type { CSSProperties } from "react";
import { formatInTimeZone } from "date-fns-tz";
import { itemClass, itemStyle, shortTime, timeRange } from "@/components/calendar/item-style";
import { NowLine } from "@/components/calendar/now-line";
import { ScrollToHour } from "@/components/calendar/scroll-to-hour";
import { SlotKeys } from "@/components/calendar/slot-keys";
import { itemsOnDay, layoutDay, type CalendarItem } from "@/lib/calendar-layout";
import { nearestFreeSlot, quickAddHref, slotIsFree, slotLabel, SLOTS_PER_DAY } from "@/lib/calendar-quick-add";
import { longDayLabel } from "@/lib/calendar-range";
import { cn } from "@/lib/utils";

/**
 * One hour's height, from the grid's own height: the scroller is a size
 * container, so `100cqh` is the space the page left it, and an hour is a
 * fourteenth of that -- 7 AM to 9 PM fills the view, however tall the window.
 * The floor keeps a 30-minute class legible on a short laptop screen.
 */
const HOUR = "max(2.75rem, calc(100cqh / 14))";
const at = (minutes: number, adjust = 0) => `calc(var(--hour) * ${minutes / 60}${adjust ? ` + ${adjust}px` : ""})`;
const hours = Array.from({ length: 24 }, (_, hour) => hour);
const slots = Array.from({ length: SLOTS_PER_DAY }, (_, slot) => slot);
/** Where Tab first lands among the empty slots: 9 AM, or the free slot nearest it. */
const FIRST_SLOT = 18;
const pad = (hour: number) => String(hour).padStart(2, "0");
const weekday = (day: string) => formatInTimeZone(`${day}T12:00:00.000Z`, "UTC", "EEE");
const hourLabel = (hour: number) => formatInTimeZone(`2026-01-01T${pad(hour)}:00:00.000Z`, "UTC", "h a");
// Header and body share columns; both reserve the scrollbar's width so the
// header's days stay over the body's when the body scrolls.
const COLUMNS = "grid grid-cols-[3rem_repeat(7,minmax(0,1fr))] [scrollbar-gutter:stable]";

/**
 * Seven day columns on a 24-hour grid, after Google Calendar's week: the date
 * under its weekday, today circled, a line at the current time. It fills the
 * height its parent gives it and scrolls the hours inside, opening at 7 AM.
 * Blocks lay out by duration rather than pixels, since the hour's height is
 * only known to the browser.
 *
 * Quick add: every empty half hour is an Add shift link for that time
 * (`quickAddHref`, two hours long by default). The slots are one tab stop
 * (SlotKeys): Tab lands near 9 AM, the arrows move by half hour and by day,
 * Enter opens Add shift. Shift blocks sit above the slots and keep their links.
 */
export function WeekGrid({ days, today, items, timeZone }: { days: string[]; today: string; items: CalendarItem[]; timeZone: string }) {
  const allDay = days.map((day) => itemsOnDay(items, day, timeZone).filter((item) => item.allDay));
  const zone = formatInTimeZone(new Date(), timeZone, "O");
  const placed = days.map((day) => layoutDay(items, day, timeZone));
  // One slot is the grid's tab stop: today's (else the first day's) free slot
  // nearest 9 AM, moving to a later day if that one is fully booked.
  const firstColumn = Math.max(0, days.indexOf(today));
  const order = [...days.keys()].slice(firstColumn).concat([...days.keys()].slice(0, firstColumn));
  const stopColumn = order.find((index) => nearestFreeSlot(FIRST_SLOT, placed[index]) !== null);
  const tabStop = stopColumn === undefined ? null : { col: stopColumn, row: nearestFreeSlot(FIRST_SLOT, placed[stopColumn]) };

  return <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border bg-[var(--card)]">
    <div className={cn(COLUMNS, "overflow-y-hidden border-b")}>
      <div className="flex items-end justify-end pb-1.5 pr-1.5 text-[11px] font-medium text-[var(--muted-foreground)]">{zone}</div>
      {days.map((day, index) => {
        const isToday = day === today;
        return <div key={day} className="min-w-0 border-l px-1 pb-1 pt-1.5">
          <p className="flex items-center justify-center gap-1.5">
            <span className="sr-only">{longDayLabel(day)}{isToday ? ", today" : ""}</span>
            <span aria-hidden="true" className={cn("text-[11px] font-semibold uppercase tracking-[0.06em]", isToday ? "text-[var(--primary)]" : "text-[var(--muted-foreground)]")}>{weekday(day)}</span>
            <span aria-hidden="true" className={cn("grid size-7 place-items-center rounded-full font-display text-base font-semibold tabular-nums", isToday ? "bg-[var(--primary)] text-[var(--primary-foreground)]" : "text-[var(--foreground)]")}>{Number(day.slice(8))}</span>
          </p>
          {allDay[index].length > 0 && <div className="mt-1 space-y-0.5">
            {allDay[index].map((item) => <span key={item.key} className={cn(itemClass(item), "py-0.5")} style={itemStyle(item)} title={item.title}><span className="block truncate">{item.title}</span></span>)}
          </div>}
        </div>;
      })}
    </div>
    <ScrollToHour hour={7} className="min-h-0 flex-1 overflow-y-auto [container-type:size] [scrollbar-gutter:stable]">
      <SlotKeys className={COLUMNS} style={{ "--hour": HOUR, height: "calc(var(--hour) * 24)" } as CSSProperties}>
        <div>{hours.map((hour) => <div key={hour} data-hour-row className="relative -top-1.5 pr-1.5 text-right text-[11px] font-medium tabular-nums text-[var(--muted-foreground)]" style={{ height: "var(--hour)" }}>{hour === 0 ? "" : hourLabel(hour)}</div>)}</div>
        {days.map((day, col) => <div key={day} role="group" aria-label={longDayLabel(day)} className="relative min-w-0 border-l">
          {/* Half-hour slots under the blocks. An empty one opens Add shift
              at its time (tap or click; a drag still scrolls); one a block
              touches is plain, so it is skipped by the arrows too. */}
          {slots.map((slot) => {
            const line = cn("block h-[calc(var(--hour)/2)]", slot % 2 === 0 && "border-t border-[color-mix(in_srgb,var(--border)_70%,transparent)]");
            const href = slotIsFree(slot, placed[col]) ? quickAddHref(day, slot) : null;
            if (!href) return <div key={slot} className={line} />;
            const isStop = tabStop?.col === col && tabStop.row === slot;
            return <Link key={slot} href={href} prefetch={false} data-slot data-col={col} data-row={slot} tabIndex={isStop ? 0 : -1} aria-label={`Add shift, ${longDayLabel(day)}, ${slotLabel(slot)}`} className={cn(line, "group flex items-center px-1.5 transition-colors hover:bg-[var(--surface-subtle)] focus-visible:relative focus-visible:z-20 focus-visible:bg-[var(--surface-subtle)] focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--primary)]")}>
              <span aria-hidden="true" className="truncate text-[11px] font-semibold leading-none text-[var(--primary)] opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">+ {slotLabel(slot)}</span>
            </Link>;
          })}
          {placed[col].map(({ item, top, height, lane, lanes }) => {
            const style = { ...itemStyle(item), top: at(top, 1), height: `max(22px, ${at(height, -2)})`, left: `calc(${(lane / lanes) * 100}% + 2px)`, width: `calc(${100 / lanes}% - 5px)` };
            const note = item.alsoInGoogle ? " · in Google" : "";
            // Under 40 minutes reads on one line, title then start; longer
            // blocks stack, and wrap the title once there is room for it.
            const body = height >= 40
              ? <><span className={cn("block break-words", height >= 105 ? "line-clamp-3" : height >= 70 ? "line-clamp-2" : "truncate")}>{item.title}</span><span className="block truncate font-normal opacity-90">{timeRange(item.startsAt, item.endsAt, timeZone)}{note}</span>{item.importJob && height >= 70 && <span className="mt-0.5 block truncate text-[var(--primary)]">+ Add as {item.importJob}</span>}</>
              : <span className="block truncate">{item.title}<span className="font-normal opacity-90">, {shortTime(item.startsAt, timeZone)}</span></span>;
            const label = `${item.title}, ${timeRange(item.startsAt, item.endsAt, timeZone)}`;
            const target = item.href ?? item.importHref;
            return target
              ? <Link key={item.key} href={target} prefetch={false} title={item.importJob ? `Add as a ${item.importJob} shift` : label} className={cn(itemClass(item), "absolute z-10 transition-[filter,box-shadow] hover:z-30 hover:shadow-md hover:brightness-[1.04]")} style={style}>{body}</Link>
              : <div key={item.key} title={label} className={cn(itemClass(item), "absolute z-10")} style={style}>{body}</div>;
          })}
          {day === today && <NowLine today={today} timeZone={timeZone} />}
        </div>)}
      </SlotKeys>
    </ScrollToHour>
  </div>;
}
