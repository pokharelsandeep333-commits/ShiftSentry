export const metadata = { title: "Users | ShiftSentry" };

import type { Prisma } from "@prisma/client";
import { UsersView } from "@/components/admin/users-view";
import { SavedToast } from "@/components/saved-toast";
import { requireAdmin } from "@/lib/auth";
import { USERS_PAGE_SIZE, readUserFilters } from "@/lib/admin-users";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await requireAdmin();
  const params = await searchParams;
  const filters = readUserFilters(params);
  const where: Prisma.ProfileWhereInput = {
    ...(filters.q ? { OR: [{ email: { contains: filters.q, mode: "insensitive" } }, { displayName: { contains: filters.q, mode: "insensitive" } }] } : {}),
    ...(filters.status === "active" ? { disabledAt: null, deletionPendingAt: null }
      : filters.status === "disabled" ? { disabledAt: { not: null } }
      : filters.status === "pending" ? { deletionPendingAt: { not: null } }
      : {}),
    ...(filters.role === "admin" ? { role: "ADMIN" } : filters.role === "user" ? { role: "USER" } : {}),
  };
  const [users, total] = await Promise.all([
    prisma.profile.findMany({ where, orderBy: { createdAt: "desc" }, take: USERS_PAGE_SIZE, skip: (filters.page - 1) * USERS_PAGE_SIZE, select: { id: true, email: true, displayName: true, role: true, disabledAt: true, deletionPendingAt: true, createdAt: true } }),
    prisma.profile.count({ where }),
  ]);
  // `?deleted=1` is where deleteAccountAsAdmin lands; the toast strips the flag.
  return <>{params.deleted === "1" && <SavedToast message="Account deleted" clearParams={["deleted"]} />}<UsersView users={users} total={total} filters={filters} /></>;
}
