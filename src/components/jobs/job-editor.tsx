import Link from "next/link";
import { Archive, CalendarDays, Percent, SlidersHorizontal } from "lucide-react";
import { archiveJob, deleteJob, deleteJobDeduction, unarchiveJob } from "@/app/actions/work";
import { BackToJobs } from "@/components/jobs/back-to-jobs";
import { AddDeductionForm, JobDetailsForm } from "@/components/jobs/job-forms";
import { JobGoogleForm } from "@/components/jobs/job-google-form";
import { JobAvatar, formatPercent, takeHomePerHourCents, withheldBasisPoints } from "@/components/jobs/job-summary";
import { SavedToast } from "@/components/saved-toast";
import { SettingsSection } from "@/components/settings/settings-section";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { formatCents } from "@/lib/earnings";
import { payScheduleFromColumns, type JobPayColumns } from "@/lib/pay-period";

const linkClass = "font-semibold text-[var(--primary)] underline-offset-4 hover:underline";

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 px-4 py-3 first:pl-0 sm:px-5 sm:first:pl-0">
    <dt className="text-xs text-[var(--muted-foreground)]">{label}</dt>
    <dd className="mt-0.5 truncate font-display text-lg font-semibold">{value}</dd>
  </div>;
}

export type EditorJob = JobPayColumns & {
  id: string;
  name: string;
  color: string;
  archived_at: string | null;
  weekly_limit_minutes: number | null;
  hourly_rate_cents: number;
  tax_rate_basis_points: number;
  google_keyword: string | null;
  google_calendar_id: string | null;
  google_sync: boolean;
  job_deductions: { id: string; name: string; rate_basis_points: number }[];
  shifts: { count: number }[];
};

/**
 * One job, edited in sections: details and pay (one form, because the action
 * validates the tax rate against the deductions), deductions, Google Calendar,
 * and archiving. Each mutation redirects back to the job's page with its
 * `?saved=` slug, except archiving, which returns to the list the job just left.
 * An archived job shows only Restore and, when it has no shifts, Delete.
 *
 * The page (`/jobs/[id]`) loads the data; this only draws it.
 * `googleCalendars` is null when Google is off or not connected, and an empty
 * list when connected but unreachable.
 */
export function JobEditor({ job, googleOn, googleCalendars, today, savedMessage }: { job: EditorJob; googleOn: boolean; googleCalendars: { id: string; summary: string; primary: boolean }[] | null; today: string; savedMessage?: string }) {
  const shifts = job.shifts[0]?.count ?? 0;
  const deductionTotal = job.job_deductions.reduce((total, deduction) => total + deduction.rate_basis_points, 0);

  const header = <>
    <BackToJobs />
    <div className="mb-6 flex items-center gap-4">
      <JobAvatar name={job.name} color={job.color} size="lg" muted={Boolean(job.archived_at)} />
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="break-words font-display text-3xl font-semibold sm:text-4xl">{job.name}</h1>
          {job.archived_at && <Badge variant="muted">Archived</Badge>}
        </div>
      </div>
    </div>
  </>;

  if (job.archived_at) return <>
    {savedMessage && <SavedToast message={savedMessage} />}
    {header}
    <Card className="grid max-w-3xl gap-4 p-5 sm:p-6">
      <p className="text-sm leading-6 text-[var(--muted-foreground)]">This job was archived on {new Date(job.archived_at).toLocaleDateString()}. It is hidden from your dashboard and left out of hours and earnings. Restore it to edit it or log shifts against it again.</p>
      <div className="flex flex-wrap items-center gap-3">
        <form action={unarchiveJob}><input type="hidden" name="id" value={job.id} /><Button>Restore job</Button></form>
        {shifts ? <p className="text-xs text-[var(--muted-foreground)]">It has {shifts} shift{shifts === 1 ? "" : "s"} logged, so it can&apos;t be deleted.</p>
          : <form action={deleteJob}><input type="hidden" name="id" value={job.id} /><ConfirmSubmit label="Delete" confirmLabel="Delete job?" variant="outline" /></form>}
      </div>
    </Card>
  </>;

  return <>
    {savedMessage && <SavedToast message={savedMessage} />}
    {header}

    <dl className="mb-6 grid max-w-3xl grid-cols-3 divide-x rounded-2xl">
      <Stat label="Hourly rate" value={formatCents(job.hourly_rate_cents)} />
      <Stat label="Take-home/hr" value={`≈ ${formatCents(takeHomePerHourCents(job))}`} />
      <Stat label="Shifts logged" value={String(shifts)} />
    </dl>

    <div className="grid max-w-3xl gap-6">
      <SettingsSection id="details" icon={SlidersHorizontal} title="Details and pay" description="Name, colour, pay, weekly limit and pay period.">
        <JobDetailsForm id={job.id} name={job.name} hourlyRateCents={job.hourly_rate_cents} taxRateBasisPoints={job.tax_rate_basis_points} color={job.color} weeklyLimitMinutes={job.weekly_limit_minutes} paySchedule={payScheduleFromColumns(job)} today={today} />
      </SettingsSection>

      <SettingsSection id="deductions" icon={Percent} title="Deductions" description="Percentages taken from gross pay, like retirement or union dues. Like the rate, they apply to shifts you add from now on.">
        <div className="grid gap-5">
          {job.job_deductions.length > 0 && <ul className="grid gap-2">
            {job.job_deductions.map((deduction) => <li key={deduction.id} className="flex items-center justify-between gap-3 rounded-xl bg-[var(--surface-subtle)] py-1.5 pl-3.5 pr-1.5 text-sm">
              <span className="min-w-0 truncate"><span className="font-semibold">{deduction.name}</span> · {formatPercent(deduction.rate_basis_points)}</span>
              <form action={deleteJobDeduction}><input type="hidden" name="id" value={deduction.id} /><Button size="sm" variant="ghost">Remove</Button></form>
            </li>)}
          </ul>}
          <p className="text-sm leading-6 text-[var(--muted-foreground)]">
            Tax {formatPercent(job.tax_rate_basis_points)}{deductionTotal ? <> + deductions {formatPercent(deductionTotal)}</> : null} = <span className="font-semibold text-[var(--foreground)]">{formatPercent(withheldBasisPoints(job))} withheld</span>. Together they can&apos;t pass 100%.
          </p>
          <div className="border-t pt-5"><AddDeductionForm jobId={job.id} /></div>
        </div>
      </SettingsSection>

      {googleOn && <SettingsSection id="google-calendar" icon={CalendarDays} title="Google Calendar" description="Which of your calendar events are this job's shifts, and whether they become shifts on their own.">
        {googleCalendars ? <JobGoogleForm jobId={job.id} jobName={job.name} keyword={job.google_keyword} calendarId={job.google_calendar_id} sync={job.google_sync} calendars={googleCalendars} />
          : <p className="text-sm leading-6 text-[var(--muted-foreground)]">Connect Google Calendar in <Link href="/settings#google-calendar" className={linkClass}>Settings</Link> first. Then you can have this job&apos;s events added as shifts automatically.</p>}
      </SettingsSection>}

      <SettingsSection id="archive" icon={Archive} title="Archive this job" description="Archived jobs are hidden from your dashboard and left out of hours and earnings. Logged shifts are kept, and you can restore the job from the Jobs page." danger>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs leading-5 text-[var(--muted-foreground)]">To delete a job, archive it first. It can be deleted once it has no shifts.</p>
          <form action={archiveJob}><input type="hidden" name="id" value={job.id} /><ConfirmSubmit label="Archive" confirmLabel="Archive job?" variant="outline" /></form>
        </div>
      </SettingsSection>
    </div>
  </>;
}
