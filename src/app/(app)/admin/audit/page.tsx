export const metadata = { title: "Audit log | ShiftSentry" };

import { AuditView } from "@/components/admin/audit-view";
import { requireAdmin } from "@/lib/auth";
import { AUDIT_PAGE_SIZE, readAuditFilters } from "@/lib/admin-audit";
import { auditWhere, loadAuditRows } from "@/lib/admin-audit-server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AuditPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const admin = await requireAdmin();
  const params = await searchParams;
  const filters = readAuditFilters((name) => params[name]);
  const where = await auditWhere(filters);
  const [rows, total, admins] = await Promise.all([
    loadAuditRows({ where, take: AUDIT_PAGE_SIZE, skip: (filters.page - 1) * AUDIT_PAGE_SIZE }),
    prisma.auditEvent.count({ where }),
    prisma.profile.findMany({ where: { role: "ADMIN" }, select: { id: true, email: true }, orderBy: { email: "asc" } }),
  ]);
  return <AuditView rows={rows} total={total} filters={filters} admins={admins} timeZone={admin.time_zone} />;
}
