import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) { await requireAdmin(); const query = (await searchParams).q?.trim() ?? ""; const users = await prisma.profile.findMany({ where: query ? { OR: [{ email: { contains: query, mode: "insensitive" } }, { displayName: { contains: query, mode: "insensitive" } }] } : undefined, orderBy: { createdAt: "desc" }, take: 100 }); return <><PageHeader eyebrow="Administration" title="User support" description="Search account records and inspect user data." actions={<form><input name="q" defaultValue={query} placeholder="Search email or name" className="field-control w-64 text-sm" /></form>} /><Card><CardContent className="space-y-1 p-2 sm:p-3">{users.map((user) => <Link href={`/admin/users/${user.id}`} key={user.id} className="flex items-center gap-4 rounded-2xl p-4 transition-colors hover:bg-[var(--surface-subtle)]"><div className="min-w-0 flex-1"><p className="truncate font-medium">{user.displayName ?? user.email}</p><p className="truncate text-sm text-[var(--muted-foreground)]">{user.email}</p></div><Badge variant={user.disabledAt ? "danger" : user.role === "ADMIN" ? "default" : "success"} className="rounded-xl">{user.disabledAt ? "Disabled" : user.role}</Badge></Link>)}{!users.length && <p className="p-10 text-center text-sm text-[var(--muted-foreground)]">No matching users.</p>}</CardContent></Card></>; }
