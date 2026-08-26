import Link from "next/link";
import { notFound } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { ShiftForm } from "@/components/shifts/shift-form";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function EditShiftPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireUser();
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const [{ data: shift }, { data: jobs }] = await Promise.all([
    supabase.from("shifts").select("id,job_id,starts_at,ends_at,notes").eq("id", id).eq("user_id", profile.id).maybeSingle(),
    supabase.from("jobs").select("id,name,color,archived_at").eq("user_id", profile.id).order("name"),
  ]);
  if (!shift) notFound();

  const selectableJobs = (jobs ?? []).filter((job) => !job.archived_at || job.id === shift.job_id).map((job) => ({ id: job.id, name: job.name, color: job.color, archived: Boolean(job.archived_at) }));

  return <AppShell isAdmin={profile.role === "ADMIN"} userEmail={profile.email}>
    <PageHeader eyebrow="Shift log" title="Edit shift" description="Update the job, schedule, or notes for this shift." actions={<Link href="/shifts"><Button variant="outline">Cancel</Button></Link>} />
    <Card className="max-w-4xl">
      <CardHeader><CardTitle>Shift details</CardTitle></CardHeader>
      <CardContent><ShiftForm mode="edit" jobs={selectableJobs} initialShift={{ id: shift.id, jobId: shift.job_id, startsAt: formatInTimeZone(shift.starts_at, profile.time_zone, "yyyy-MM-dd'T'HH:mm"), endsAt: formatInTimeZone(shift.ends_at, profile.time_zone, "yyyy-MM-dd'T'HH:mm"), notes: shift.notes }} /></CardContent>
    </Card>
  </AppShell>;
}
