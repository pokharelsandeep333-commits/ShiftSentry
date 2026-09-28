import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { itemsOnDay, type CalendarItem } from "@/lib/calendar-layout";
import { cn } from "@/lib/utils";

/** The phone layout: the same items as a day-by-day list; empty days are skipped. */
export function AgendaList({ days, today, items, timeZone }: { days: string[]; today: string; items: CalendarItem[]; timeZone: string }) {
  const time = (iso: string) => formatInTimeZone(iso, timeZone, "h:mm a");
  const withItems = days.map((day) => ({ day, dayItems: itemsOnDay(items, day, timeZone) })).filter(({ dayItems }) => dayItems.length > 0);
  if (withItems.length === 0) return <p className="rounded-2xl border border-dashed p-5 text-sm text-[var(--muted-foreground)]">Nothing scheduled in this range.</p>;

  return <div className="space-y-5">
    {withItems.map(({ day, dayItems }) => <section key={day}>
      <h2 className={cn("text-sm font-semibold", day === today && "text-[var(--primary)]")}>{day === today ? "Today · " : ""}{formatInTimeZone(`${day}T12:00:00.000Z`, "UTC", "EEEE, MMM d")}</h2>
      <ul className="mt-2 space-y-2">
        {dayItems.map((item) => {
          const body = <>
            <span className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", item.kind === "event" && "ring-2 ring-inset ring-[var(--card)]")} style={{ backgroundColor: item.color }} />
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{item.title}</span>
              <span className="block text-sm text-[var(--muted-foreground)]">{item.allDay ? "All day" : `${time(item.startsAt)} – ${time(item.endsAt)}`}{item.kind === "event" ? " · Google Calendar" : item.alsoInGoogle ? " · also in Google Calendar" : ""}</span>
              {item.importJob && <span className="mt-1 block text-sm font-semibold text-[var(--primary)]">+ Add as {item.importJob} shift</span>}
            </span>
            {item.overlap && <span className="shrink-0 rounded-lg bg-[color-mix(in_srgb,var(--warning)_14%,transparent)] px-2 py-0.5 text-xs font-semibold text-[color-mix(in_srgb,var(--warning)_62%,var(--foreground))]">Overlap</span>}
          </>;
          const target = item.href ?? item.importHref;
          return <li key={item.key}>{target
            ? <Link href={target} className="flex items-start gap-3 rounded-2xl border bg-[var(--card)] p-3 transition-colors hover:bg-[var(--surface-subtle)]">{body}</Link>
            : <div className="flex items-start gap-3 rounded-2xl border bg-[var(--card)] p-3">{body}</div>}</li>;
        })}
      </ul>
    </section>)}
  </div>;
}
