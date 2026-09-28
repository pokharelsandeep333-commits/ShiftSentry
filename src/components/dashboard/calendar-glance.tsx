import { CalendarDays } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { buildGlance, glanceWindow, type GlanceShift } from "@/lib/calendar-glance";
import { calendarColorMap, listCalendars, listEvents } from "@/lib/google/client";
import { withCalendarAccess } from "@/lib/google/connection";
import { createServerSupabaseClient } from "@/lib/supabase/server";

function Shell({ children }: { children: React.ReactNode }) {
  return <Card className="h-full"><CardHeader><CardTitle className="flex items-center gap-2"><CalendarDays className="size-5 text-[var(--primary)]" />From your calendar</CardTitle><CardDescription>Google Calendar, next 7 days</CardDescription></CardHeader><CardContent>{children}</CardContent></Card>;
}

export function CalendarGlanceSkeleton() {
  return <Shell><div className="space-y-3"><div className="skeleton h-4 w-24" /><div className="skeleton h-10" /><div className="skeleton h-10" /></div></Shell>;
}

/**
 * Streams in after the dashboard: one Google round trip per selected calendar,
 * in parallel, 3 s each. Its shift query is its own small RLS read, outside
 * getDashboardData's two passes. Rendered only for a connected account.
 */
export async function CalendarGlance({ userId, timeZone }: { userId: string; timeZone: string }) {
  const now = new Date();
  const range = glanceWindow(now, timeZone);
  const supabase = await createServerSupabaseClient();
  const [access, { data: shiftRows }] = await Promise.all([
    withCalendarAccess(userId, async (token, calendarIds) => {
      const [events, calendars] = await Promise.all([listEvents(token, calendarIds, range, timeZone), listCalendars(token)]);
      return { events, colors: calendarColorMap(calendars) };
    }),
    supabase.from("shifts").select("id,starts_at,ends_at,jobs!inner(name,archived_at)").eq("user_id", userId).is("jobs.archived_at", null).lt("starts_at", range.timeMax).gt("ends_at", range.timeMin),
  ]);

  if (access.status !== "ok") {
    if (access.status === "needs_reconnect") return <Shell><p className="text-sm text-[var(--muted-foreground)]">Google Calendar needs reconnecting.</p><a href="/integrations/google/connect" className="mt-3 inline-flex min-h-11 items-center font-semibold text-[var(--primary)]">Reconnect</a></Shell>;
    if (access.status === "unavailable") return <Shell><p className="text-sm text-[var(--muted-foreground)]">Couldn&apos;t load your calendar right now.</p></Shell>;
    return null;
  }

  const shifts: GlanceShift[] = (shiftRows ?? []).map((row) => ({ id: row.id, jobName: row.jobs.name, startsAt: row.starts_at, endsAt: row.ends_at }));
  const { days, hidden } = buildGlance(access.value.events, shifts, now, timeZone);
  if (days.length === 0) return <Shell><p className="text-sm text-[var(--muted-foreground)]">Nothing on your calendar for the next 7 days.</p></Shell>;

  const time = (iso: string) => formatInTimeZone(iso, timeZone, "h:mm a");
  return <Shell>
    <div className="space-y-4">
      {days.map((day) => <section key={day.key}>
        <h3 className="text-xs font-semibold text-[var(--muted-foreground)]">{day.label}</h3>
        <ul className="mt-1.5 space-y-1">
          {day.rows.map(({ event, overlapsJob }) => <li key={`${event.calendarId}:${event.id}`} className="flex items-center gap-3 rounded-xl px-2 py-1.5">
            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: access.value.colors.get(event.calendarId) ?? "var(--primary)" }} />
            <span className="w-28 shrink-0 text-sm tabular-nums text-[var(--muted-foreground)]">{event.allDay ? "All day" : `${time(event.startsAt)}–${time(event.endsAt)}`}</span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{event.title}</span>
            {overlapsJob && <span className="shrink-0 rounded-lg bg-[color-mix(in_srgb,var(--warning)_14%,transparent)] px-2 py-0.5 text-xs font-semibold text-[color-mix(in_srgb,var(--warning)_62%,var(--foreground))]">Overlaps {overlapsJob}</span>}
          </li>)}
        </ul>
      </section>)}
      {hidden > 0 && <p className="text-xs text-[var(--muted-foreground)]">+{hidden} more</p>}
    </div>
  </Shell>;
}
