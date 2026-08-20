import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AdminUsersPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) { await requireAdmin(); const query = (await searchParams).q?.trim() ?? ""; const users = await prisma.profile.findMany({ where: query ? { OR: [{ email: { contains: query, mode: "insensitive" } }, { displayName: { contains: query, mode: "insensitive" } }] } : undefined, orderBy: { createdAt: "desc" }, take: 100 }); return <AppShell isAdmin><PageHeader eyebrow="Administration" title="User support" description="Search account records and inspect user data." actions={<form><input name="q" defaultValue={query} placeholder="Search email or name" className="h-10 rounded-lg border bg-transparent px-3 text-sm" /></form>} /><Card><CardContent className="divide-y p-0">{users.map((user) => <Link href={`/admin/users/${user.id}`} key={user.id} className="flex items-center gap-4 p-4 hover:bg-[var(--muted)]"><div className="min-w-0 flex-1"><p className="truncate font-medium">{user.displayName ?? user.email}</p><p className="truncate text-sm text-[var(--muted-foreground)]">{user.email}</p></div><Badge variant={user.disabledAt ? "danger" : user.role === "ADMIN" ? "default" : "success"}>{user.disabledAt ? "Disabled" : user.role}</Badge></Link>)}{!users.length && <p className="p-10 text-center text-sm text-[var(--muted-foreground)]">No matching users.</p>}</CardContent></Card></AppShell>; }
