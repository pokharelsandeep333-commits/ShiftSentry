import Link from "next/link";
import { CalendarDays, ChevronRight, RefreshCw } from "lucide-react";
import { JobAvatar, formatPercent, takeHomePerHourCents, withheldBasisPoints } from "@/components/jobs/job-summary";
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

function Figure({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0 px-3 first:pl-0 last:pr-0">
    <dt className="truncate text-xs text-[var(--muted-foreground)]">{label}</dt>
    <dd className="mt-1 truncate text-[15px] font-semibold tabular-nums tracking-tight">{value}</dd>
  </div>;
}

/**
 * One active job on the jobs list, as a single link to its page (nothing
 * inside is interactive). Three bands, the same height on every card so a row
 * of cards lines up: the name (two lines at most, room for two kept), three
 * figures, and the pay period with any limit or sync. `shifts` is PostgREST's
 * embedded count, a one-row array.
 */
export function JobCard({ job, googleOn }: { job: CardJob; googleOn: boolean }) {
  const schedule = payScheduleFromColumns(job);
  const deductions = job.job_deductions.length;
  const shifts = job.shifts[0]?.count ?? 0;
  const synced = googleOn && job.google_sync;

  return <Link href={`/jobs/${job.id}`} className="press group block h-full rounded-[1.35rem] outline-none focus-visible:ring-4 focus-visible:ring-[var(--primary-soft)]">
    <Card className="flex h-full flex-col p-5 group-hover:border-[color-mix(in_srgb,var(--primary)_35%,var(--border))]">
      <div className="flex items-start gap-3.5">
        <JobAvatar name={job.name} color={job.color} />
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 min-h-12 break-words font-display text-[1.05rem] font-semibold leading-6 tracking-tight" title={job.name}>{job.name}</p>
        </div>
        <ChevronRight className="mt-0.5 size-5 shrink-0 text-[var(--muted-foreground)] transition-[translate,color] group-hover:translate-x-0.5 group-hover:text-[var(--primary)]" aria-hidden="true" />
      </div>

      <dl className="mt-4 grid grid-cols-[minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,0.75fr)] divide-x border-y py-3.5">
        <Figure label="Rate/hr" value={formatCents(job.hourly_rate_cents)} />
        <Figure label="Take-home/hr" value={`≈ ${formatCents(takeHomePerHourCents(job))}`} />
        <Figure label={deductions ? "Withheld" : "Tax"} value={formatPercent(withheldBasisPoints(job))} />
      </dl>

      <div className="mt-3.5 grid flex-1 content-end gap-2 text-sm">
        <p className="flex min-w-0 items-center gap-2 text-[var(--muted-foreground)]">
          <CalendarDays className="size-4 shrink-0" aria-hidden="true" />
          <span className="truncate">{schedule ? <>Paid <span className="text-[var(--foreground)]">{describePaySchedule(schedule).replace(/^./, (letter) => letter.toLowerCase())}</span></> : "No pay period set"}</span>
        </p>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--muted-foreground)]">
          <span className="tabular-nums">{shifts} shift{shifts === 1 ? "" : "s"} logged</span>
          {job.weekly_limit_minutes ? <><span aria-hidden="true">·</span><span>{formatMinutes(job.weekly_limit_minutes)} a week max</span></> : null}
          {synced && <><span aria-hidden="true">·</span><span className="inline-flex items-center gap-1"><RefreshCw className="size-3 text-[var(--success)]" aria-hidden="true" />Google sync</span></>}
        </p>
      </div>
    </Card>
  </Link>;
}
