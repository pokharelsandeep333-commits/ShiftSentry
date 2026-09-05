import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ShiftForm, type ShiftFormJob } from "@/components/shifts/shift-form";
import { requireUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { parseShiftDateTimeInput } from "@/lib/shift-date-time";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Prefill from a "Duplicate" link. Every field is treated as untrusted URL
 * input: the job has to be one of the viewer's active jobs and both timestamps
 * have to parse, otherwise the form opens blank.
 */
function prefillFromQuery(params: SearchParams, jobs: ShiftFormJob[]) {
  const jobId = single(params.jobId);
  const startsAt = parseShiftDateTimeInput(single(params.startsAt) ?? "");
  const endsAt = parseShiftDateTimeInput(single(params.endsAt) ?? "");
  if (!jobId || !jobs.some((job) => job.id === jobId) || !startsAt || !endsAt) return undefined;
  return { jobId, startsAt: startsAt.value, endsAt: endsAt.value, notes: (single(params.notes) ?? "").slice(0, 500) || null };
}

export default async function NewShiftPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const profile = await requireUser();
  const supabase = await createServerSupabaseClient();
  const [{ data: jobs }, params] = await Promise.all([
    supabase.from("jobs").select("id,name,color,hourly_rate_cents,tax_rate_basis_points,job_deductions(name,rate_basis_points)").eq("user_id", profile.id).is("archived_at", null).order("name"),
    searchParams,
  ]);
  const selectableJobs: ShiftFormJob[] = (jobs ?? []).map((job) => ({ id: job.id, name: job.name, color: job.color, hourlyRateCents: job.hourly_rate_cents, taxRateBasisPoints: job.tax_rate_basis_points, deductions: (job.job_deductions ?? []).map((deduction) => ({ name: deduction.name, rateBasisPoints: deduction.rate_basis_points })) }));
  const initialShift = prefillFromQuery(params, selectableJobs);

  return <>
    <PageHeader eyebrow="Shift log" title="Add a shift" description="Scheduled future shifts count toward projected weekly hours." actions={<Link href="/shifts" className={buttonVariants({ variant: "outline" })}>Cancel</Link>} />
    <Card className="max-w-4xl">
      <CardHeader><CardTitle>Shift details</CardTitle></CardHeader>
      <CardContent>{selectableJobs.length ? <ShiftForm mode="create" jobs={selectableJobs} timeZone={profile.time_zone} initialShift={initialShift} /> : <div className="space-y-4 rounded-2xl border border-dashed p-5"><p className="text-sm leading-6 text-[var(--muted-foreground)]">Create a job before adding a shift.</p><Link href="/jobs" className={buttonVariants()}>Create a job</Link></div>}</CardContent>
    </Card>
  </>;
}
