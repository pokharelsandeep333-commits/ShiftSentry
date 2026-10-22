export const metadata = { title: "Dashboard | ShiftSentry", robots: { index: false, follow: false } };

import { DashboardView } from "@/components/dashboard/dashboard-view";
import { requireUser } from "@/lib/auth";
import { getDashboardData } from "@/lib/dashboard";
import { demoDashboardFor } from "@/lib/dashboard-demo";
import { isGoogleCalendarEnabled } from "@/lib/google/config";
import { getConnectionSummary } from "@/lib/google/connection";
import { hasSyncingJob } from "@/lib/google/shift-sync";
import { GoogleSyncTrigger } from "@/components/google-sync-trigger";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (!isSupabaseConfigured()) return <DashboardView data={demoDashboardFor(new Date())} />;
  const profile = await requireUser();
  const [data, connection] = await Promise.all([getDashboardData(profile), isGoogleCalendarEnabled() ? getConnectionSummary(profile.id) : null]);
  const syncing = connection?.status === "active" && await hasSyncingJob(profile.id);
  return <>{syncing && <GoogleSyncTrigger />}<DashboardView data={data} /></>;
}
