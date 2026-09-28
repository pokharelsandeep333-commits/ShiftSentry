import { Suspense } from "react";
import { CalendarGlance, CalendarGlanceSkeleton } from "@/components/dashboard/calendar-glance";
import { DashboardView } from "@/components/dashboard/dashboard-view";
import { requireUser } from "@/lib/auth";
import { getDashboardData } from "@/lib/dashboard";
import { demoDashboard } from "@/lib/dashboard-demo";
import { isGoogleCalendarEnabled } from "@/lib/google/config";
import { getConnectionSummary } from "@/lib/google/connection";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (!isSupabaseConfigured()) return <DashboardView data={demoDashboard} />;
  const profile = await requireUser();
  const [data, connection] = await Promise.all([getDashboardData(profile), isGoogleCalendarEnabled() ? getConnectionSummary(profile.id) : null]);
  const calendarSlot = connection ? <Suspense fallback={<CalendarGlanceSkeleton />}><CalendarGlance userId={profile.id} timeZone={profile.time_zone} /></Suspense> : undefined;
  return <DashboardView data={data} calendarSlot={calendarSlot} />;
}
