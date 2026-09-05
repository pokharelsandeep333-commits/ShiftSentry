import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { archiveJob, deleteJob, deleteJobDeduction, unarchiveJob } from "@/app/actions/work";
import { AddDeductionForm, CreateJobForm, JobDetailsForm } from "@/components/jobs/job-forms";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { formatCents } from "@/lib/earnings";
import { formatMinutes } from "@/lib/utils";
import { SavedToast } from "@/components/saved-toast";

export const dynamic = "force-dynamic";

/**
 * Confirmation copy for the `?saved=` flag each mutation redirects with. These
 * actions used to only revalidate, so the page re-rendered looking identical
 * and nothing told you the write had landed.
 */
const SAVED_MESSAGES: Record<string, string> = {
  "job-created": "Job created",
  "job-updated": "Job updated",
  "job-archived": "Job archived",
  "job-restored": "Job restored",
  "job-deleted": "Job deleted",
  "deduction-added": "Deduction added",
  "deduction-removed": "Deduction removed",
};

/**
 * PostgREST returns an embedded aggregate as a one-row array. A job with no
 * shifts can be deleted outright; one with shifts is held by the ON DELETE
 * RESTRICT foreign key on shifts.job_id.
 */
function shiftCount(job: { shifts: { count: number }[] }) {
  return job.shifts[0]?.count ?? 0;
}

export default async function JobsPage({ searchParams }: { searchParams: Promise<{ saved?: string | string[] }> }) {
  const [profile, { saved }] = await Promise.all([requireUser(), searchParams]);
  const supabase = await createServerSupabaseClient();
  const { data: allJobs } = await supabase.from("jobs").select("id,name,color,archived_at,weekly_limit_minutes,hourly_rate_cents,tax_rate_basis_points,job_deductions(id,name,rate_basis_points),shifts(count)").eq("user_id", profile.id).order("name");
  const jobs = (allJobs ?? []).filter((job) => !job.archived_at);
  const archivedJobs = (allJobs ?? []).filter((job) => job.archived_at);
  const savedMessage = SAVED_MESSAGES[Array.isArray(saved) ? saved[0] ?? "" : saved ?? ""];

  return <>
    {savedMessage && <SavedToast message={savedMessage} />}
    <PageHeader eyebrow="Jobs" title="Jobs, pay, and deductions" description="Rates are saved onto each new shift, so changing them never changes past earnings." />
    <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
      <Card>
        <CardHeader><CardTitle>Your active jobs</CardTitle></CardHeader>
        <CardContent className="space-y-3">{jobs.length ? jobs.map((job) => <div key={job.id} className="rounded-2xl border bg-[var(--card)]/45 p-4 transition-[transform,border-color,background-color] duration-300 hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--primary)_28%,var(--border))] hover:bg-[var(--surface-subtle)]">
          <div className="flex items-start gap-3"><span className="mt-1.5 size-3 shrink-0 rounded-full shadow-sm" style={{ background: job.color }} /><div className="min-w-0 flex-1"><p className="font-display text-lg font-semibold">{job.name}</p><p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">{formatCents(job.hourly_rate_cents)}/hr · {job.tax_rate_basis_points / 100}% tax · {job.weekly_limit_minutes ? `${formatMinutes(job.weekly_limit_minutes)} weekly limit` : "No hour limit"}</p></div><form action={archiveJob}><input type="hidden" name="id" value={job.id} /><ConfirmSubmit label="Archive" confirmLabel="Archive job?" /></form></div>
          <details className="group mt-4 border-t pt-4"><summary className="flex cursor-pointer list-none items-center justify-between rounded-xl px-1 py-1 text-sm font-semibold text-[var(--primary)] outline-none transition-colors hover:text-[var(--foreground)] focus-visible:ring-4 focus-visible:ring-[var(--primary-soft)]"><span>Manage job settings, pay, and deductions</span><span className="text-lg transition-transform duration-300 group-open:rotate-45">+</span></summary><div className="mt-4 grid gap-5">
            <JobDetailsForm id={job.id} name={job.name} hourlyRateCents={job.hourly_rate_cents} taxRateBasisPoints={job.tax_rate_basis_points} color={job.color} weeklyLimitMinutes={job.weekly_limit_minutes} />
            <div><p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Percentage deductions</p><div className="space-y-2">{job.job_deductions.map((deduction) => <div key={deduction.id} className="flex items-center justify-between rounded-xl bg-[var(--surface-subtle)] px-3 py-2.5 text-sm"><span>{deduction.name} · {deduction.rate_basis_points / 100}%</span><form action={deleteJobDeduction}><input type="hidden" name="id" value={deduction.id} /><Button size="sm" variant="ghost">Remove</Button></form></div>)}</div><AddDeductionForm jobId={job.id} /></div>
          </div></details>
        </div>) : <div className="rounded-2xl border border-dashed px-5 py-10 text-center"><p className="text-sm leading-6 text-[var(--muted-foreground)]">No jobs yet. A job holds the pay rate, tax, and weekly cap that every shift you log against it inherits.</p></div>}</CardContent>
      </Card>
      {archivedJobs.length > 0 && <Card>
        <CardHeader><CardTitle>Archived jobs</CardTitle></CardHeader>
        <CardContent className="space-y-2"><p className="text-sm leading-6 text-[var(--muted-foreground)]">Archived jobs are hidden from your dashboard and excluded from hours and earnings. Restore one to start logging shifts against it again. A job can only be deleted once it has no shifts, so its earnings history is never lost.</p>{archivedJobs.map((job) => <div key={job.id} className="flex items-center gap-3 rounded-2xl border border-dashed bg-[var(--surface-subtle)]/50 px-4 py-3">
          <span className="size-3 shrink-0 rounded-full opacity-60" style={{ background: job.color }} />
          <div className="min-w-0 flex-1"><p className="truncate font-medium">{job.name}</p><p className="mt-0.5 text-xs text-[var(--muted-foreground)]">{formatCents(job.hourly_rate_cents)}/hr · archived {new Date(job.archived_at!).toLocaleDateString()}</p></div>
          {shiftCount(job) ? <span className="text-xs font-medium text-[var(--muted-foreground)]">{shiftCount(job)} shift{shiftCount(job) === 1 ? "" : "s"} logged</span> : <form action={deleteJob}><input type="hidden" name="id" value={job.id} /><ConfirmSubmit label="Delete" confirmLabel="Delete job?" /></form>}
          <form action={unarchiveJob}><input type="hidden" name="id" value={job.id} /><Button variant="outline" size="sm">Restore</Button></form>
        </div>)}</CardContent>
      </Card>}
      <Card className="h-fit">
        <CardHeader><CardTitle>Add a job</CardTitle></CardHeader>
        <CardContent><CreateJobForm /></CardContent>
      </Card>
    </div>
  </>;
}
