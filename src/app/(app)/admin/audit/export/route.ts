import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth";
import { csvRow, auditActionLabel, readAuditFilters } from "@/lib/admin-audit";
import { auditWhere, loadAuditRows } from "@/lib/admin-audit-server";
import { prisma } from "@/lib/prisma";
import { createRateLimiter } from "@/lib/rate-limit";
import { isSameSiteRequest } from "@/lib/request-origin";

export const dynamic = "force-dynamic";

/** More than the 30-day window has ever held; a cap so one request has a bounded cost. */
const MAX_ROWS = 5_000;
const allowExport = createRateLimiter({ limit: 5, windowMs: 60_000 });

/**
 * The audit log as CSV, for exactly the filters on screen. POST and same-site
 * only: the download writes an audit row, so a link, a prefetch or another
 * site must not be able to start one. The file holds account emails, so it is
 * sent no-store and the download is itself audited, with the filters used but
 * not the email searched for.
 */
export async function POST(request: Request) {
  if (!isSameSiteRequest(request)) return new NextResponse("Forbidden", { status: 403 });
  const admin = await requireAdmin();
  if (!allowExport(admin.id)) return new NextResponse("Too many downloads. Try again in a minute.", { status: 429 });

  const form = await request.formData();
  const filters = readAuditFilters((name) => form.get(name));
  const rows = await loadAuditRows({ where: await auditWhere(filters), take: MAX_ROWS });

  await prisma.auditEvent.create({ data: { actorId: admin.id, action: "audit.exported", metadata: { rows: rows.length, days: filters.days, action: filters.action || null, actor: filters.actor || null, targetFiltered: Boolean(filters.target) } } });

  const lines = [
    csvRow(["time_utc", "action", "description", "admin", "account", "account_id"]),
    ...rows.map((row) => csvRow([row.createdAt.toISOString(), row.action, auditActionLabel(row.action), row.actor ?? "system", row.target, row.targetUserId])),
  ];
  const day = new Date().toISOString().slice(0, 10);
  // A byte-order mark so spreadsheet apps read the file as UTF-8.
  return new NextResponse(`﻿${lines.join("\r\n")}\r\n`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="shiftsentry-audit-${day}.csv"`,
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
