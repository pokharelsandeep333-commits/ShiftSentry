import { Suspense, type ReactNode } from "react";
import { AnnouncementSlot } from "@/components/announcement-slot";
import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { getWeekMeter } from "@/lib/dashboard";
import { demoDashboard } from "@/lib/dashboard-demo";
import { buildWeekMeter } from "@/lib/week-meter";

/**
 * The chrome for every signed-in route. It lives here rather than inside each
 * page for two reasons: a shared layout is not re-rendered when you navigate
 * between its children, so the sidebar and bottom bar stay mounted and only the
 * page body swaps -- and `requireUser()` runs once per full load instead of once
 * per navigation.
 *
 * `/login`, `/account-disabled` and `/offline` sit outside this group because
 * they must render without a session.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  if (!isSupabaseConfigured()) return <AppShell isDemo weekMeter={Promise.resolve(buildWeekMeter(demoDashboard.jobs, demoDashboard.globalLimitMinutes))}>{children}</AppShell>;
  const profile = await requireUser();

  // Not awaited: the header meter streams in behind its own Suspense boundary,
  // so no page waits on it. A revalidating Server Action refreshes every
  // dynamic segment, this layout included, so the meter follows each save.
  // The admin announcement streams the same way, above the page body and
  // outside the page template, so it does not slide with page changes.
  return <AppShell isAdmin={profile.role === "ADMIN"} userEmail={profile.email} userName={profile.display_name} weekMeter={getWeekMeter(profile)}>
    <Suspense fallback={null}><AnnouncementSlot /></Suspense>
    {children}
  </AppShell>;
}
