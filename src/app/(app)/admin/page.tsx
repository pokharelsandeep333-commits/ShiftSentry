export const metadata = { title: "Administration | ShiftSentry" };

import { AdminOverview } from "@/components/admin/admin-overview";
import { requireAdmin } from "@/lib/auth";
import { loadAuditRows } from "@/lib/admin-audit-server";
import { getUsageStats } from "@/lib/admin-stats";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const admin = await requireAdmin();
  const [stats, recent] = await Promise.all([getUsageStats(), loadAuditRows({ take: 6 })]);
  return <AdminOverview stats={stats} recent={recent} timeZone={admin.time_zone} />;
}
