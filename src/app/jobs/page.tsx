import { AppShell } from "@/components/app-shell";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { addJobDeduction, archiveJob, createJob, deleteJobDeduction, updateJobDetails } from "@/app/actions/work";
import { formatCents } from "@/lib/earnings";
import { formatMinutes } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function JobsPage() {
  const profile = await requireUser();
  const supabase = await createServerSupabaseClient();
  const { data: jobs } = await supabase.from("jobs").select("id,name,color,weekly_limit_minutes,hourly_rate_cents,tax_rate_basis_points,job_deductions(id,name,rate_basis_points)").eq("user_id", profile.id).is("archived_at", null).order("name");

  return <AppShell isAdmin={profile.role === "ADMIN"} userEmail={profile.email}>
    <PageHeader eyebrow="Jobs" title="Jobs, pay, and deductions" description="Rates are saved onto each new shift, so changing them never changes past earnings." />
    <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
      <Card>
        <CardHeader><CardTitle>Your active jobs</CardTitle></CardHeader>
        <CardContent className="space-y-3">{jobs?.length ? jobs.map((job) => <div key={job.id} className="rounded-2xl border bg-[var(--card)]/45 p-4 transition-[transform,border-color,background-color] duration-300 hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--primary)_28%,var(--border))] hover:bg-[var(--surface-subtle)]">
          <div className="flex items-start gap-3"><span className="mt-1.5 size-3 shrink-0 rounded-full shadow-sm" style={{ background: job.color }} /><div className="min-w-0 flex-1"><p className="font-display text-lg font-semibold">{job.name}</p><p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">{formatCents(job.hourly_rate_cents)}/hr · {job.tax_rate_basis_points / 100}% tax · {job.weekly_limit_minutes ? `${formatMinutes(job.weekly_limit_minutes)} weekly limit` : "No hour limit"}</p></div><form action={archiveJob}><input type="hidden" name="id" value={job.id} /><Button variant="ghost" size="sm">Archive</Button></form></div>
          <details className="group mt-4 border-t pt-4"><summary className="flex cursor-pointer list-none items-center justify-between rounded-xl px-1 py-1 text-sm font-semibold text-[var(--primary)] outline-none transition-colors hover:text-[var(--foreground)] focus-visible:ring-4 focus-visible:ring-[var(--primary-soft)]"><span>Manage job settings, pay, and deductions</span><span className="text-lg transition-transform duration-300 group-open:rotate-45">+</span></summary><div className="mt-4 grid gap-5">
            <form action={updateJobDetails} className="grid gap-3 sm:grid-cols-4"><input type="hidden" name="id" value={job.id} /><label className="field-label text-xs"><span>Hourly rate ($)</span><input name="hourlyRate" type="text" inputMode="decimal" defaultValue={(job.hourly_rate_cents / 100).toFixed(2)} className="field-control h-10 text-sm" /></label><label className="field-label text-xs"><span>Tax (%)</span><input name="taxRate" type="text" inputMode="decimal" defaultValue={(job.tax_rate_basis_points / 100).toFixed(2)} className="field-control h-10 text-sm" /></label><label className="field-label text-xs"><span>Color</span><input name="color" type="color" defaultValue={job.color} className="field-control h-10 cursor-pointer p-1.5" /></label><div className="flex items-end"><Button size="sm" type="submit">Save job</Button></div></form>
            <div><p className="mb-2 text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Percentage deductions</p><div className="space-y-2">{job.job_deductions.map((deduction) => <div key={deduction.id} className="flex items-center justify-between rounded-xl bg-[var(--surface-subtle)] px-3 py-2.5 text-sm"><span>{deduction.name} · {deduction.rate_basis_points / 100}%</span><form action={deleteJobDeduction}><input type="hidden" name="id" value={deduction.id} /><Button size="sm" variant="ghost">Remove</Button></form></div>)}</div><form action={addJobDeduction} className="mt-3 grid gap-2 sm:grid-cols-[1fr_110px_auto]"><input type="hidden" name="jobId" value={job.id} /><input name="name" required maxLength={80} placeholder="e.g. Retirement" className="field-control h-10 text-sm" /><input name="rate" required placeholder="3.00" inputMode="decimal" className="field-control h-10 text-sm" /><Button size="sm" type="submit">Add</Button></form></div>
          </div></details>
        </div>) : <p className="rounded-2xl border border-dashed py-10 text-center text-sm text-[var(--muted-foreground)]">No jobs created yet.</p>}</CardContent>
      </Card>
      <Card className="h-fit">
        <CardHeader><CardTitle>Add a job</CardTitle></CardHeader>
        <CardContent><form action={createJob} className="grid gap-4"><label className="field-label"><span>Job name</span><input name="name" required maxLength={80} className="field-control" placeholder="e.g. Campus desk" /></label><div className="grid grid-cols-2 gap-3"><label className="field-label"><span>Hourly rate ($)</span><input name="hourlyRate" required inputMode="decimal" placeholder="18.50" className="field-control" /></label><label className="field-label"><span>Tax rate (%)</span><input name="taxRate" required inputMode="decimal" defaultValue="0" className="field-control" /></label></div><label className="field-label"><span>Color</span><input name="color" type="color" defaultValue="#9486ff" className="field-control h-11 cursor-pointer p-1.5" /></label><label className="field-label"><span>Weekly limit (hours)</span><input name="weeklyLimitHours" type="number" min={1} max={168} className="field-control" placeholder="Leave blank for no limit" /></label><p className="rounded-xl bg-[var(--surface-subtle)] px-3 py-2.5 text-xs leading-5 text-[var(--muted-foreground)]">You can add named percentage deductions after creating the job.</p><Button type="submit">Create job</Button></form></CardContent>
      </Card>
    </div>
  </AppShell>;
}
