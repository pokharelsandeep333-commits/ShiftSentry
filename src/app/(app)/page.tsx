import { DashboardView } from "@/components/dashboard/dashboard-view";
import { requireUser } from "@/lib/auth";
import { getDashboardData } from "@/lib/dashboard";
import { demoDashboard } from "@/lib/dashboard-demo";
import { isSupabaseConfigured } from "@/lib/supabase/config";

export const dynamic = "force-dynamic";

export default async function Home() {
  if (!isSupabaseConfigured()) return <DashboardView data={demoDashboard} />;
  const profile = await requireUser();
  return <DashboardView data={await getDashboardData(profile)} />;
}
