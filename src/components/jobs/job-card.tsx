import Link from "next/link";
import { ChevronRight, RefreshCw } from "lucide-react";
import { JobAvatar, formatPercent, takeHomePerHourCents, withheldBasisPoints } from "@/components/jobs/job-summary";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { formatCents } from "@/lib/earnings";
import { describePaySchedule, payScheduleFromColumns, type JobPayColumns } from "@/lib/pay-period";
import { formatMinutes } from "@/lib/utils";

export type CardJob = JobPayColumns & {
  id: string;
  name: string;
  color: string;
  weekly_limit_minutes: number | null;
  hourly_rate_cents: number;
  tax_rate_basis_points: number;
  google_sync: boolean;
  job_deductions: { name: string; rate_basis_points: number }[];
  shifts: { count: number }[];
};

/**
 * One active job on the jobs list: what it is set to, as a single link to its
 * page. Nothing inside is interactive, so the whole card can be the link.
 * `shifts` is PostgREST's embedded count, a one-row array.
 */
export function JobCard({ job, googleOn }: { job: CardJob; googleOn: boolean }) {
  const schedule = payScheduleFromColumns(job);
  const deductions = job.job_deductions.length;
  const shifts = job.shifts[0]?.count ?? 0;
  return <Link href={`/jobs/${job.id}`} className="press group block h-full rounded-[1.35rem] outline-none focus-visible:ring-4 focus-visible:ring-[var(--primary-soft)]">
    <Card className="flex h-full flex-col p-5 group-hover:border-[color-mix(in_srgb,var(--primary)_35%,var(--border))]">
      <div className="flex items-start gap-3.5">
        <JobAvatar name={job.name} color={job.color} />
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-lg font-semibold">{job.name}</p>
          <p className="text-sm text-[var(--muted-foreground)]"><span className="font-semibold text-[var(--foreground)]">{formatCents(job.hourly_rate_cents)}/hr</span> · about {formatCents(takeHomePerHourCents(job))} take-home</p>
        </div>
        <ChevronRight className="mt-1 size-5 shrink-0 text-[var(--muted-foreground)] transition-[translate] group-hover:translate-x-0.5 group-hover:text-[var(--primary)]" aria-hidden="true" />
      </div>
      <dl className="mt-5 grid flex-1 grid-cols-2 content-start gap-x-4 gap-y-3 border-t pt-4 text-sm">
        <div><dt className="text-xs text-[var(--muted-foreground)]">Weekly limit</dt><dd className="mt-0.5 font-semibold">{job.weekly_limit_minutes ? formatMinutes(job.weekly_limit_minutes) : "None"}</dd></div>
        <div><dt className="text-xs text-[var(--muted-foreground)]">Tax and deductions</dt><dd className="mt-0.5 font-semibold">{formatPercent(withheldBasisPoints(job))}{deductions ? <span className="font-normal text-[var(--muted-foreground)]"> · {deductions} deduction{deductions === 1 ? "" : "s"}</span> : null}</dd></div>
        <div className="col-span-2"><dt className="text-xs text-[var(--muted-foreground)]">Pay period</dt><dd className="mt-0.5 font-semibold">{schedule ? describePaySchedule(schedule) : <span className="font-normal text-[var(--muted-foreground)]">Not set</span>}</dd></div>
      </dl>
      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Badge variant="muted">{shifts} shift{shifts === 1 ? "" : "s"}</Badge>
        {googleOn && job.google_sync && <Badge variant="success"><RefreshCw className="mr-1 size-3" aria-hidden="true" />Google sync on</Badge>}
      </div>
    </Card>
  </Link>;
}
