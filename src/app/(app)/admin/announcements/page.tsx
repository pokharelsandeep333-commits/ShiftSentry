export const metadata = { title: "Announcements | ShiftSentry" };

import { AnnouncementsView, type AnnouncementRow } from "@/components/admin/announcements-view";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AnnouncementsPage() {
  const admin = await requireAdmin();
  const rows = await prisma.siteAnnouncement.findMany({ orderBy: { createdAt: "desc" }, take: 11, select: { id: true, message: true, tone: true, createdAt: true, clearedAt: true, author: { select: { email: true } } } });
  const all: AnnouncementRow[] = rows.map((row) => ({ id: row.id, message: row.message, tone: row.tone, createdAt: row.createdAt, clearedAt: row.clearedAt, author: row.author?.email ?? null }));
  const live = all.find((row) => !row.clearedAt) ?? null;
  return <AnnouncementsView live={live} history={all.filter((row) => row !== live).slice(0, 10)} timeZone={admin.time_zone} />;
}
