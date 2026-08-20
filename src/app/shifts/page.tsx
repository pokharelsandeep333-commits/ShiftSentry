import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { deleteShift } from "@/app/actions/work";
import { formatMinutes } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ShiftsPage() { const profile = await requireUser(); const supabase = await createServerSupabaseClient(); const { data: shifts } = await supabase.from("shifts").select("id,starts_at,ends_at,notes,jobs(name,color)").eq("user_id", profile.id).order("starts_at", { ascending: false }).limit(100); return <AppShell isAdmin={profile.role === "ADMIN"}><PageHeader eyebrow="Shift log" title="All shifts" description="Future entries are included in projected cap warnings." actions={<Link href="/shifts/new"><Button>Add shift</Button></Link>} /><Card><CardContent className="divide-y p-0">{shifts?.length ? shifts.map((shift) => { const job = Array.isArray(shift.jobs) ? shift.jobs[0] : shift.jobs; const duration = Math.round((new Date(shift.ends_at).getTime() - new Date(shift.starts_at).getTime()) / 60000); const future = new Date(shift.starts_at) > new Date(); return <div key={shift.id} className="flex flex-wrap items-center gap-4 p-5"><span className="size-3 rounded-full" style={{ background: job?.color ?? "#98a2b3" }} /><div className="min-w-48 flex-1"><p className="font-medium">{job?.name ?? "Archived job"}</p><p className="text-sm text-[var(--muted-foreground)]">{formatInTimeZone(shift.starts_at, profile.time_zone, "EEE, MMM d · h:mm a")} – {formatInTimeZone(shift.ends_at, profile.time_zone, "h:mm a")}</p></div><span className="text-sm font-medium">{formatMinutes(duration)}</span><Badge variant={future ? "default" : "muted"}>{future ? "Scheduled" : "Logged"}</Badge><form action={deleteShift}><input type="hidden" name="id" value={shift.id} /><Button variant="ghost" size="sm">Delete</Button></form></div>; }) : <p className="p-10 text-center text-sm text-[var(--muted-foreground)]">No shifts yet.</p>}</CardContent></Card></AppShell>; }
