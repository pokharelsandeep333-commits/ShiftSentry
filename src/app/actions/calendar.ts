"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { listCalendars } from "@/lib/google/client";
import { deleteConnection, withCalendarAccess } from "@/lib/google/connection";
import type { SavedFormState } from "@/lib/form-state";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/** Keeps only ids present in the user's live Google calendar list; "primary" stays valid as Google's alias. */
export async function saveCalendarSelection(_previous: SavedFormState, formData: FormData): Promise<SavedFormState> {
  const profile = await requireUser();
  const requested = formData.getAll("calendarId").filter((value): value is string => typeof value === "string");
  const access = await withCalendarAccess(profile.id, (token) => listCalendars(token));
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
