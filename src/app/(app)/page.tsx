export const metadata = { title: "Dashboard | ShiftSentry", robots: { index: false, follow: false } };

import { DashboardView } from "@/components/dashboard/dashboard-view";
import { requireUser } from "@/lib/auth";
import { getDashboardData } from "@/lib/dashboard";
import { demoDashboardFor } from "@/lib/dashboard-demo";
import { isGoogleCalendarEnabled } from "@/lib/google/config";
import { getConnectionSummary } from "@/lib/google/connection";
import { hasSyncingJob } from "@/lib/google/shift-sync";
import { GoogleSyncTrigger } from "@/components/google-sync-trigger";
import { ShiftClock } from "@/components/shifts/shift-clock";
import { getRunningTimer } from "@/lib/shift-timer-server";
import { suggestedClockJob } from "@/lib/shift-timer";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (!isSupabaseConfigured()) return <DashboardView data={demoDashboardFor(new Date())} />;
  const profile = await requireUser();
  const [data, connection, timer] = await Promise.all([getDashboardData(profile), isGoogleCalendarEnabled() ? getConnectionSummary(profile.id) : null, getRunningTimer(profile.id)]);
  const syncing = connection?.status === "active" && await hasSyncingJob(profile.id);
  // The shift under way or about to start, from what the dashboard already
  // read, so Start adopts it in one tap.
  const nearby = [data.currentShift, ...data.upcomingShifts].filter((shift) => shift !== null).map((shift) => ({ id: shift.id, jobId: shift.jobId, startsAt: new Date(shift.startsAt), endsAt: new Date(shift.endsAt) }));
  const clock = <ShiftClock key="clock" timer={timer} jobs={data.jobs.map((job) => ({ id: job.id, name: job.name, color: job.color }))} initialJobId={suggestedClockJob(nearby, new Date(data.snapshotAt))} timeZone={data.viewer.timeZone} weekStartsOn={data.viewer.weekStartsOn} snapshotAt={data.snapshotAt} />;
  return <>{syncing && <GoogleSyncTrigger />}<DashboardView data={data} clock={clock} timer={timer} /></>;
}
