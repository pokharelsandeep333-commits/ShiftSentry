import { CheckCircle2, Database, ServerCog } from "lucide-react";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireAdmin } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function HealthPage() { await requireAdmin(); let database = "healthy"; try { await prisma.$queryRaw`SELECT 1`; } catch { database = "unavailable"; } return <AppShell isAdmin><PageHeader eyebrow="Administration" title="System health" description="A concise view of application dependencies." /><div className="grid gap-4 md:grid-cols-2"><Card><CardHeader><CardTitle className="flex items-center gap-2"><ServerCog className="size-5 text-[var(--primary)]" />Application</CardTitle></CardHeader><CardContent><Badge variant="success"><CheckCircle2 className="mr-1 size-3" />Healthy</Badge><p className="mt-3 text-sm text-[var(--muted-foreground)]">Next.js server routes are responding.</p></CardContent></Card><Card><CardHeader><CardTitle className="flex items-center gap-2"><Database className="size-5 text-[var(--primary)]" />Database</CardTitle></CardHeader><CardContent><Badge variant={database === "healthy" ? "success" : "danger"}>{database}</Badge><p className="mt-3 text-sm text-[var(--muted-foreground)]">Direct server-side connection used by administrative queries.</p></CardContent></Card></div></AppShell>; }
