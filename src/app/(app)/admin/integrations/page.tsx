export const metadata = { title: "Integrations | ShiftSentry" };

import { IntegrationsView } from "@/components/admin/integrations-view";
import { requireAdmin } from "@/lib/auth";
import { getGoogleHealth } from "@/lib/admin-integrations";

export const dynamic = "force-dynamic";

export default async function IntegrationsPage() {
  const admin = await requireAdmin();
  return <IntegrationsView google={await getGoogleHealth()} timeZone={admin.time_zone} />;
}
