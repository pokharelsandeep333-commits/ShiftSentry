export const metadata = { title: "System health | ShiftSentry" };

import { HealthView } from "@/components/admin/health-view";
import { requireAdmin } from "@/lib/auth";
import { getSystemHealth } from "@/lib/admin-health";

export const dynamic = "force-dynamic";

export default async function HealthPage() {
  await requireAdmin();
  return <HealthView health={await getSystemHealth()} />;
}
