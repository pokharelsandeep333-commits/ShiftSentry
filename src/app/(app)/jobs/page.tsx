export const metadata = { title: "Jobs | ShiftSentry" };

import Link from "next/link";
import { BriefcaseBusiness, ChevronRight, Plus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { deleteJob, unarchiveJob } from "@/app/actions/work";
import { JobCard } from "@/components/jobs/job-card";
import { JobAvatar } from "@/components/jobs/job-summary";
import { jobSavedMessage } from "@/components/jobs/saved-messages";
import { LoadError } from "@/components/load-error";
import { SavedToast } from "@/components/saved-toast";
import { requireUser } from "@/lib/auth";
import { formatCents } from "@/lib/earnings";
import { isGoogleCalendarEnabled } from "@/lib/google/config";
import { JOB_PAY_COLUMNS } from "@/lib/pay-period";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/**
 * PostgREST returns an embedded aggregate as a one-row array. A job with no
 * shifts can be deleted outright; one with shifts is held by the ON DELETE
 * RESTRICT foreign key on shifts.job_id.
 */
function shiftCount(job: { shifts: { count: number }[] }) {
  return job.shifts[0]?.count ?? 0;
}

const addJobLink = <Link href="/jobs/new" className={buttonVariants()}><Plus className="size-4" />Add job</Link>;

/**
 * The jobs list. Each job is one card that opens its own page (/jobs/[id]),
 * where it is edited; this page only shows what each job is set to, so a new
 * user can see at a glance what a job holds. Nothing here calls Google: the
 * calendar settings live on the job's page, so the list never waits on it.
 */
export default async function JobsPage({ searchParams }: { searchParams: Promise<{ saved?: string | string[] }> }) {
  const [profile, { saved }] = await Promise.all([requireUser(), searchParams]);
  const supabase = await createServerSupabaseClient();
  const { data: allJobs, error: jobsError } = await supabase.from("jobs").select(`id,name,color,archived_at,weekly_limit_minutes,hourly_rate_cents,tax_rate_basis_points,google_sync,${JOB_PAY_COLUMNS},job_deductions(id,name,rate_basis_points),shifts(count)`).eq("user_id", profile.id).order("name");
  const jobs = (allJobs ?? []).filter((job) => !job.archived_at);
  const archivedJobs = (allJobs ?? []).filter((job) => job.archived_at);
  const savedMessage = jobSavedMessage(saved);
  const googleOn = isGoogleCalendarEnabled();

  const header = <PageHeader title="Jobs" description="Each job holds the pay rate, tax, deductions and weekly limit that its shifts are measured against." actions={jobs.length ? addJobLink : undefined} />;
  if (jobsError) return <>{header}<LoadError what="jobs" /></>;

  return <>
    {savedMessage && <SavedToast message={savedMessage} />}
    {header}

    {jobs.length ? <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {jobs.map((job) => <li key={job.id}><JobCard job={job} googleOn={googleOn} /></li>)}
      <li>
        <Link href="/jobs/new" className="press flex h-full min-h-40 flex-col items-center justify-center gap-2 rounded-[1.35rem] border border-dashed p-5 text-sm font-semibold text-[var(--muted-foreground)] outline-none hover:border-[color-mix(in_srgb,var(--primary)_40%,var(--border))] hover:bg-[var(--primary-soft)] hover:text-[var(--primary)] focus-visible:ring-4 focus-visible:ring-[var(--primary-soft)]">
          <span className="grid size-10 place-items-center rounded-xl border border-dashed"><Plus className="size-5" aria-hidden="true" /></span>
          Add another job
        </Link>
      </li>
    </ul> : <Card className="grid justify-items-center gap-4 px-6 py-12 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-[var(--primary-soft)] text-[var(--primary)]"><BriefcaseBusiness className="size-6" aria-hidden="true" /></span>
      <div>
        <h2 className="font-display text-xl font-semibold">Add your first job</h2>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[var(--muted-foreground)]">A job holds the pay rate, tax and weekly limit that every shift you log against it uses. You need one before you can log a shift.</p>
      </div>
      {addJobLink}
    </Card>}

    {archivedJobs.length > 0 && <details className="group mt-8" open={saved === "job-archived" || undefined}>
      <summary className="flex min-h-11 w-fit cursor-pointer list-none items-center gap-2 rounded-xl px-2 text-sm font-semibold text-[var(--muted-foreground)] outline-none hover:text-[var(--foreground)] focus-visible:ring-4 focus-visible:ring-[var(--primary-soft)] [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-4 transition-transform group-open:rotate-90" aria-hidden="true" />
        Archived jobs ({archivedJobs.length})
      </summary>
      <Card className="mt-3 p-5">
        <p className="mb-2 max-w-2xl text-sm leading-6 text-[var(--muted-foreground)]">Archived jobs are hidden from your dashboard and left out of hours and earnings. Restore one to log shifts against it again. A job can only be deleted once it has no shifts, so its earnings history is never lost.</p>
        <ul className="divide-y">{archivedJobs.map((job) => <li key={job.id} className="flex flex-wrap items-center gap-3 py-3">
          <JobAvatar name={job.name} color={job.color} muted />
          <div className="min-w-0 flex-1"><p className="truncate font-medium">{job.name}</p><p className="mt-0.5 text-xs text-[var(--muted-foreground)]">{formatCents(job.hourly_rate_cents)}/hr · archived {new Date(job.archived_at!).toLocaleDateString()}{shiftCount(job) ? ` · ${shiftCount(job)} shift${shiftCount(job) === 1 ? "" : "s"} logged` : ""}</p></div>
          <div className="flex items-center gap-2">
            {!shiftCount(job) && <form action={deleteJob}><input type="hidden" name="id" value={job.id} /><ConfirmSubmit label="Delete" confirmLabel="Delete job?" size="sm" /></form>}
            <form action={unarchiveJob}><input type="hidden" name="id" value={job.id} /><Button variant="outline" size="sm">Restore</Button></form>
          </div>
        </li>)}</ul>
      </Card>
    </details>}
  </>;
}
