import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AuditPage() { await requireAdmin(); const events = await prisma.auditEvent.findMany({ take: 100, orderBy: { createdAt: "desc" }, include: { actor: { select: { email: true } } } }); return <AppShell isAdmin><PageHeader eyebrow="Administration" title="Audit log" description="Every administrative account action is retained here." /><Card><CardContent className="divide-y p-0">{events.length ? events.map((event) => <div className="p-4" key={event.id}><p className="font-medium">{event.action}</p><p className="mt-1 text-sm text-[var(--muted-foreground)]">{event.actor?.email ?? "System"} · {event.createdAt.toLocaleString()} {event.targetUserId ? `· user ${event.targetUserId}` : ""}</p></div>) : <p className="p-10 text-center text-sm text-[var(--muted-foreground)]">No events have been recorded.</p>}</CardContent></Card></AppShell>; }
