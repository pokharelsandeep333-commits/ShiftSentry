import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createShift } from "@/app/actions/work";

export const dynamic = "force-dynamic";

export default async function NewShiftPage() { const profile = await requireUser(); const supabase = await createServerSupabaseClient(); const { data: jobs } = await supabase.from("jobs").select("id,name").eq("user_id", profile.id).is("archived_at", null).order("name"); return <AppShell isAdmin={profile.role === "ADMIN"}><PageHeader eyebrow="Shift log" title="Add a shift" description="Scheduled future shifts count toward projected weekly hours." actions={<Link href="/shifts"><Button variant="outline">Cancel</Button></Link>} /><Card className="max-w-2xl"><CardHeader><CardTitle>Shift details</CardTitle></CardHeader><CardContent>{jobs?.length ? <form action={createShift} className="grid gap-5"><label className="grid gap-1.5 text-sm font-medium">Job<select name="jobId" required className="h-10 rounded-lg border bg-transparent px-3">{jobs.map((job) => <option key={job.id} value={job.id}>{job.name}</option>)}</select></label><div className="grid gap-5 sm:grid-cols-2"><label className="grid gap-1.5 text-sm font-medium">Start<input name="startsAt" type="datetime-local" required className="h-10 rounded-lg border bg-transparent px-3" /></label><label className="grid gap-1.5 text-sm font-medium">End<input name="endsAt" type="datetime-local" required className="h-10 rounded-lg border bg-transparent px-3" /></label></div><label className="grid gap-1.5 text-sm font-medium">Notes <textarea name="notes" maxLength={500} className="min-h-24 rounded-lg border bg-transparent p-3 text-sm" placeholder="Optional notes" /></label><div><Button type="submit">Save shift</Button></div></form> : <div className="space-y-3"><p className="text-sm text-[var(--muted-foreground)]">Create a job before adding a shift.</p><Link href="/jobs"><Button>Create a job</Button></Link></div>}</CardContent></Card></AppShell>; }
