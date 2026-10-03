import { buildCalendarItems, type CalendarItem } from "@/lib/calendar-layout";
import type { CalendarRange } from "@/lib/calendar-range";
import { calendarColorMap, listCalendars, listEvents } from "@/lib/google/client";
import { isGoogleCalendarEnabled } from "@/lib/google/config";
import { withCalendarAccess } from "@/lib/google/connection";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type CalendarGoogleState = "off" | "not_connected" | "needs_reconnect" | "unavailable" | "ok";
export type CalendarLegendEntry = { id: string; name: string; color: string };
export type CalendarPageData = { items: CalendarItem[]; google: CalendarGoogleState; jobs: CalendarLegendEntry[]; calendars: CalendarLegendEntry[] };

/**
 * Everything the calendar page draws for one range: the viewer's shifts (RLS
 * client, archived jobs excluded like everywhere else) and, when connected,
 * that range's Google events -- fetched live, never stored. A month view can
 * hold far more than the clash check's 50 events per calendar, hence 250.
 * The rail's legends come from the same reads: the active jobs, and the names
 * of the selected calendars from the list already fetched for colours (shown,
 * never stored).
 */
export async function loadCalendarPage(profile: { id: string; time_zone: string }, range: CalendarRange): Promise<CalendarPageData> {
  const supabase = await createServerSupabaseClient();
  const [{ data: rows, error }, { data: jobs }, access] = await Promise.all([
    supabase.from("shifts").select("id,starts_at,ends_at,google_event_id,jobs!inner(name,color,archived_at,google_keyword)").eq("user_id", profile.id).is("jobs.archived_at", null).lt("starts_at", range.timeMax).gt("ends_at", range.timeMin).order("starts_at").limit(1000),
    supabase.from("jobs").select("id,name,color,keyword:google_keyword").eq("user_id", profile.id).is("archived_at", null).order("name"),
    isGoogleCalendarEnabled()
      ? withCalendarAccess(profile.id, async (token, calendarIds) => {
        // The calendar list only supplies colours; losing it must not lose the events.
        const [events, calendars] = await Promise.all([listEvents(token, calendarIds, { timeMin: range.timeMin, timeMax: range.timeMax }, profile.time_zone, 250), listCalendars(token).catch(() => [])]);
        const selected = new Set(calendarIds);
        const shown = calendars.filter((calendar) => selected.has(calendar.id) || (calendar.primary && selected.has("primary"))).map((calendar) => ({ id: calendar.id, name: calendar.summary, color: calendar.color }));
        return { events, colors: calendarColorMap(calendars), calendars: shown };
      })
      : Promise.resolve({ status: "disabled" as const }),
  ]);

  // An empty grid would read as "nothing scheduled"; a failed read has to say so.
  if (error) throw new Error("Could not load your shifts.");
  const shifts = (rows ?? []).map((row) => ({ id: row.id, jobName: row.jobs.name, keyword: row.jobs.google_keyword, color: row.jobs.color, startsAt: row.starts_at, endsAt: row.ends_at, linked: row.google_event_id !== null }));
  const options = { jobs: jobs ?? [], timeZone: profile.time_zone };
  const legend = (jobs ?? []).map((job) => ({ id: job.id, name: job.name, color: job.color }));
  if (access.status !== "ok") return { items: buildCalendarItems(shifts, [], new Map(), options), google: access.status === "disabled" ? "off" : access.status, jobs: legend, calendars: [] };
  return { items: buildCalendarItems(shifts, access.value.events, access.value.colors, options), google: "ok", jobs: legend, calendars: access.value.calendars };
}
