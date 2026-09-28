import { buildCalendarItems, type CalendarItem } from "@/lib/calendar-layout";
import type { CalendarRange } from "@/lib/calendar-range";
import { calendarColorMap, listCalendars, listEvents } from "@/lib/google/client";
import { isGoogleCalendarEnabled } from "@/lib/google/config";
import { withCalendarAccess } from "@/lib/google/connection";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type CalendarGoogleState = "off" | "not_connected" | "needs_reconnect" | "unavailable" | "ok";

/**
 * Everything the calendar page draws for one range: the viewer's shifts (RLS
 * client, archived jobs excluded like everywhere else) and, when connected,
 * that range's Google events -- fetched live, never stored. A month view can
 * hold far more than the clash check's 50 events per calendar, hence 250.
 */
export async function loadCalendarPage(profile: { id: string; time_zone: string }, range: CalendarRange): Promise<{ items: CalendarItem[]; google: CalendarGoogleState }> {
  const supabase = await createServerSupabaseClient();
  const [{ data: rows }, access] = await Promise.all([
    supabase.from("shifts").select("id,starts_at,ends_at,jobs!inner(name,color,archived_at)").eq("user_id", profile.id).is("jobs.archived_at", null).lt("starts_at", range.timeMax).gt("ends_at", range.timeMin).order("starts_at").limit(1000),
    isGoogleCalendarEnabled()
      ? withCalendarAccess(profile.id, async (token, calendarIds) => {
        const [events, calendars] = await Promise.all([listEvents(token, calendarIds, { timeMin: range.timeMin, timeMax: range.timeMax }, profile.time_zone, 250), listCalendars(token)]);
        return { events, colors: calendarColorMap(calendars) };
      })
      : Promise.resolve({ status: "disabled" as const }),
  ]);

  const shifts = (rows ?? []).map((row) => ({ id: row.id, jobName: row.jobs.name, color: row.jobs.color, startsAt: row.starts_at, endsAt: row.ends_at }));
  if (access.status !== "ok") return { items: buildCalendarItems(shifts, [], new Map()), google: access.status === "disabled" ? "off" : access.status };
  return { items: buildCalendarItems(shifts, access.value.events, access.value.colors), google: "ok" };
}
