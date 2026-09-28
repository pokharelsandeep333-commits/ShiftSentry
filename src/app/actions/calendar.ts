"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { listCalendars } from "@/lib/google/client";
import { deleteConnection, withCalendarAccess } from "@/lib/google/connection";
import type { SavedFormState } from "@/lib/form-state";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { jobGoogleSettingsSchema } from "@/lib/validation";
import { isGoogleCalendarEnabled } from "@/lib/google/config";

/** Keeps only ids present in the user's live Google calendar list; "primary" stays valid as Google's alias. */
export async function saveCalendarSelection(_previous: SavedFormState, formData: FormData): Promise<SavedFormState> {
  const profile = await requireUser();
  const requested = formData.getAll("calendarId").filter((value): value is string => typeof value === "string");
  const access = await withCalendarAccess(profile.id, (token) => listCalendars(token));
  if (access.status === "needs_reconnect") {
    // Access was revoked or expired: the card has to swap the picker for Reconnect.
    revalidatePath("/settings");
    return { message: "Google Calendar needs reconnecting. Use Reconnect above.", savedAt: null };
  }
  if (access.status !== "ok") return { message: "Couldn't reach Google Calendar. Try again in a moment.", savedAt: null };
  const known = new Set(access.value.map((calendar) => calendar.id));
  const primaryId = access.value.find((calendar) => calendar.primary)?.id;
  const selected = [...new Set(requested.map((id) => (id === primaryId ? "primary" : id)))].filter((id) => id === "primary" || known.has(id)).slice(0, 25);
  if (selected.length === 0) return { message: "Choose at least one calendar.", savedAt: null };
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("google_calendar_connections").update({ selected_calendar_ids: selected }).eq("user_id", profile.id);
  if (error) return { message: "Couldn't save your calendars. Try again.", savedAt: null };
  revalidatePath("/");
  revalidatePath("/settings");
  return { message: "", savedAt: Date.now() };
}

export async function disconnectGoogleCalendar() {
  const profile = await requireUser();
  await deleteConnection(profile.id);
  revalidatePath("/");
  revalidatePath("/settings");
  redirect("/settings?saved=google-disconnected");
}

/**
 * A job's Google Calendar settings. A named calendar must be one of the user's
 * live calendars (the primary one is stored as Google's "primary" alias, which
 * is how the calendar picker and the sync fetch it). Turning sync off detaches
 * the job's synced shifts -- they stay, as ordinary shifts -- and forgets the
 * events the user had deleted.
 */
export async function saveJobGoogleSettings(_previous: SavedFormState, formData: FormData): Promise<SavedFormState> {
  const profile = await requireUser();
  if (!isGoogleCalendarEnabled()) return { message: "Google Calendar isn't available right now.", savedAt: null };
  const parsed = jobGoogleSettingsSchema.safeParse({ jobId: formData.get("jobId"), keyword: formData.get("keyword"), calendarId: formData.get("calendarId"), sync: formData.get("sync") });
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? "Check the Google Calendar settings.", savedAt: null };
  const { jobId, keyword, sync } = parsed.data;
  let calendarId = parsed.data.calendarId;
  if (calendarId && calendarId !== "primary") {
    const access = await withCalendarAccess(profile.id, (token) => listCalendars(token));
    if (access.status !== "ok") return { message: "Couldn't reach Google Calendar to check that calendar. Try again.", savedAt: null };
    const match = access.value.find((calendar) => calendar.id === calendarId);
    if (!match) return { message: "Choose one of your Google calendars.", savedAt: null };
    if (match.primary) calendarId = "primary";
  }

  const supabase = await createServerSupabaseClient();
  const { data: job } = await supabase.from("jobs").select("id,google_sync").eq("id", jobId).eq("user_id", profile.id).maybeSingle();
  if (!job) return { message: "This job could not be found.", savedAt: null };
  const turningOff = job.google_sync && !sync;
  if (turningOff) {
    const { error: detachError } = await supabase.from("shifts").update({ google_calendar_id: null, google_event_id: null }).eq("job_id", jobId).eq("user_id", profile.id).not("google_event_id", "is", null);
    if (detachError) return { message: "Couldn't turn off sync. Try again.", savedAt: null };
  }
  const { error } = await supabase.from("jobs").update({ google_keyword: keyword, google_calendar_id: calendarId, google_sync: sync, ...(turningOff ? { google_sync_ignored: [] } : {}) }).eq("id", jobId).eq("user_id", profile.id);
  if (error) return { message: "Couldn't save the Google Calendar settings. Try again.", savedAt: null };
  // Let the next page visit sync straight away rather than waiting out the throttle.
  if (sync) await supabase.from("google_calendar_connections").update({ shifts_synced_at: null }).eq("user_id", profile.id);
  revalidatePath("/"); revalidatePath("/jobs"); revalidatePath("/calendar"); revalidatePath("/shifts");
  return { message: "", savedAt: Date.now() };
}
