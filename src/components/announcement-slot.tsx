import { AnnouncementBanner } from "@/components/announcement-banner";
import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Reads the live announcement as the signed-in user, through RLS, which hands
 * back the live one or nothing. The columns are named because users hold a
 * column grant, not the table. Rendered under its own Suspense boundary by the
 * app layout, and a failed read shows nothing rather than failing the page.
 */
export async function AnnouncementSlot() {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from("site_announcements").select("id,message,tone").is("cleared_at", null).maybeSingle();
  if (error || !data) return null;
  return <AnnouncementBanner id={data.id} message={data.message} tone={data.tone === "warning" ? "warning" : "info"} />;
}
