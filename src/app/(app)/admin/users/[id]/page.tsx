import { notFound } from "next/navigation";
import { AdminUserView } from "@/components/admin/user-view";
import { requireAdmin } from "@/lib/auth";
import { loadAuditRows } from "@/lib/admin-audit-server";
import { LEGAL_VERSION } from "@/lib/legal";
import { prisma } from "@/lib/prisma";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { resourceIdSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";
export const metadata = { title: "Account | ShiftSentry" };

/**
 * Counts and account facts only (see AdminUserView). The Auth lookup and the
 * room count use the admin Supabase client because Prisma does not read the
 * Auth schema or the game tables; either failing leaves its field blank rather
 * than failing the page.
 */
export default async function AdminUserPage({ params }: { params: Promise<{ id: string }> }) {
  const admin = await requireAdmin();
  const { id } = await params;
  if (!resourceIdSchema.safeParse(id).success) notFound();

  const supabase = createAdminSupabaseClient();
  const [profile, jobs, shifts, weekNotes, acceptance, google, authUser, rooms, audit, notes] = await Promise.all([
    prisma.profile.findUnique({ where: { id }, select: { id: true, email: true, displayName: true, role: true, disabledAt: true, deletionPendingAt: true, createdAt: true } }),
    prisma.job.count({ where: { userId: id } }),
    prisma.shift.count({ where: { userId: id } }),
    prisma.weekNote.count({ where: { userId: id } }),
    prisma.legalAcceptance.findFirst({ where: { userId: id }, orderBy: { acceptedAt: "desc" }, select: { version: true } }),
    prisma.googleCalendarConnection.findUnique({ where: { userId: id }, select: { status: true } }),
    supabase.auth.admin.getUserById(id).catch(() => null),
    Promise.resolve(supabase.from("game_room_players").select("room_id", { count: "exact", head: true }).eq("user_id", id)).catch(() => null),
    loadAuditRows({ where: { targetUserId: id }, take: 10 }),
    prisma.adminUserNote.findMany({ where: { userId: id }, orderBy: { createdAt: "desc" }, take: 50, select: { id: true, body: true, createdAt: true, author: { select: { email: true } } } }),
  ]);
  if (!profile) notFound();

  const auth = authUser && !authUser.error ? authUser.data.user : null;
  const providers = auth ? (Array.isArray(auth.app_metadata?.providers) ? auth.app_metadata.providers as string[] : auth.app_metadata?.provider ? [String(auth.app_metadata.provider)] : []) : null;

  return <AdminUserView
    isSelf={profile.id === admin.id}
    timeZone={admin.time_zone}
    audit={audit}
    notes={notes.map((note) => ({ id: note.id, body: note.body, createdAt: note.createdAt, author: note.author?.email ?? null }))}
    user={{
      ...profile,
      lastSignInAt: auth?.last_sign_in_at ? new Date(auth.last_sign_in_at) : null,
      providers,
      acceptedVersion: acceptance?.version ?? null,
      currentVersion: LEGAL_VERSION,
      google: google ? (google.status === "needs_reconnect" ? "needs_reconnect" : "active") : null,
      counts: { jobs, shifts, weekNotes, rooms: rooms && !rooms.error ? rooms.count ?? 0 : null },
    }}
  />;
}
