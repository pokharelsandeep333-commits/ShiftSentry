import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PremiumSelect } from "@/components/ui/premium-select";
import { requireUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createShift } from "@/app/actions/work";

export const dynamic = "force-dynamic";

export default async function NewShiftPage() {
  const profile = await requireUser();
  const supabase = await createServerSupabaseClient();
  const { data: jobs } = await supabase.from("jobs").select("id,name").eq("user_id", profile.id).is("archived_at", null).order("name");

  return <AppShell isAdmin={profile.role === "ADMIN"} userEmail={profile.email}>
    <PageHeader eyebrow="Shift log" title="Add a shift" description="Scheduled future shifts count toward projected weekly hours." actions={<Link href="/shifts"><Button variant="outline">Cancel</Button></Link>} />
    <Card className="max-w-2xl">
      <CardHeader><CardTitle>Shift details</CardTitle></CardHeader>
      <CardContent>{jobs?.length ? <form action={createShift} className="grid gap-5">
        <div className="field-label"><span id="job-label">Job</span><PremiumSelect name="jobId" defaultValue={jobs[0].id} options={jobs.map((job) => ({ value: job.id, label: job.name }))} labelledBy="job-label" required /></div>
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="field-label"><span>Start</span><input name="startsAt" type="datetime-local" required className="field-control" /></label>
          <label className="field-label"><span>End</span><input name="endsAt" type="datetime-local" required className="field-control" /></label>
        </div>
        <label className="field-label"><span>Notes</span><textarea name="notes" maxLength={500} className="field-textarea text-sm" placeholder="Optional notes" /></label>
        <div><Button type="submit">Save shift</Button></div>
      </form> : <div className="space-y-4 rounded-2xl border border-dashed p-5"><p className="text-sm leading-6 text-[var(--muted-foreground)]">Create a job before adding a shift.</p><Link href="/jobs"><Button>Create a job</Button></Link></div>}</CardContent>
    </Card>
  </AppShell>;
}
