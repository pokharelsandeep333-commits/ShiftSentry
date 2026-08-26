import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShiftForm } from "@/components/shifts/shift-form";
import { requireUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function NewShiftPage() {
  const profile = await requireUser();
  const supabase = await createServerSupabaseClient();
  const { data: jobs } = await supabase.from("jobs").select("id,name,color").eq("user_id", profile.id).is("archived_at", null).order("name");

  return <AppShell isAdmin={profile.role === "ADMIN"} userEmail={profile.email}>
    <PageHeader eyebrow="Shift log" title="Add a shift" description="Scheduled future shifts count toward projected weekly hours." actions={<Link href="/shifts"><Button variant="outline">Cancel</Button></Link>} />
    <Card className="max-w-2xl">
      <CardHeader><CardTitle>Shift details</CardTitle></CardHeader>
      <CardContent>{jobs?.length ? <ShiftForm mode="create" jobs={jobs} /> : <div className="space-y-4 rounded-2xl border border-dashed p-5"><p className="text-sm leading-6 text-[var(--muted-foreground)]">Create a job before adding a shift.</p><Link href="/jobs"><Button>Create a job</Button></Link></div>}</CardContent>
    </Card>
  </AppShell>;
}
