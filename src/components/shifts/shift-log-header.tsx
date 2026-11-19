import type { ReactNode } from "react";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { PageHeader } from "@/components/page-header";
import { ExpandAllWeeks } from "@/components/shifts/week-disclosure";
import { isFiltered, shiftLogHref, type ShiftFilters, type ShiftShow } from "@/lib/shift-log";
import type { SyncIssue } from "@/lib/google-sync-plan";
import { cn } from "@/lib/utils";

const SHOWS: { value: ShiftShow; label: string }[] = [
  { value: "all", label: "All" },
  { value: "upcoming", label: "Upcoming" },
  { value: "worked", label: "Worked" },
];

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return <Link href={href} aria-current={active ? "true" : undefined} scroll={false} className={cn(
    "press inline-flex min-h-9 shrink-0 snap-start items-center gap-2 whitespace-nowrap rounded-full border px-3 text-xs font-semibold outline-none sm:max-w-full sm:shrink focus-visible:ring-4 focus-visible:ring-[var(--primary-soft)]",
    active ? "border-[color-mix(in_srgb,var(--primary)_35%,var(--border))] bg-[var(--primary-soft)] text-[var(--primary)]" : "bg-[var(--card)]/60 text-[var(--muted-foreground)] hover:bg-[var(--surface-subtle)] hover:text-[var(--foreground)]",
  )}>{children}</Link>;
}

/**
 * The log's heading and the filters. Add shift is the header's "+" (labelled
 * from sm); the page no longer repeats it on a phone, where it cost a row. Filters are links
 * that rewrite the address (`?show=`, `?job=`), so a filtered view survives a
 * refresh, a delete (which carries them back) and the back button. The job
 * chips are the active jobs, in their colours.
 */
export function ShiftLogHeader({ weeks, filters, jobs, openableWeeks, clock }: { weeks: number; filters: ShiftFilters; jobs: { id: string; name: string; color: string }[]; openableWeeks: { key: string; defaultOpen: boolean }[]; clock?: ReactNode }) {
  return <>
    <PageHeader
      title="Shifts"
      description="Everything you have worked or scheduled, week by week. Open a shift to change it."
    />
    {clock}
    {/* One row that scrolls sideways on a phone (it wrapped to three rows
        there, pushing the log down); from sm it wraps as before. */}
    {jobs.length > 0 && <nav aria-label="Filter shifts" className="shift-scroller -mx-4 mb-4 flex snap-x scroll-px-4 items-center gap-2 overflow-x-auto px-4 py-1 sm:mx-0 sm:mb-5 sm:flex-wrap sm:overflow-visible sm:p-0">
      <span className="shift-segment shrink-0 snap-start">
        {SHOWS.map((show) => <Link key={show.value} href={shiftLogHref(weeks, { ...filters, show: show.value })} aria-current={filters.show === show.value ? "true" : undefined} scroll={false}>{show.label}</Link>)}
      </span>
      {jobs.length > 1 && <>
        <span aria-hidden="true" className="mx-1 h-5 w-px shrink-0 bg-[var(--border)]" />
        <Chip href={shiftLogHref(weeks, { ...filters, job: "" })} active={!filters.job}>All jobs</Chip>
        {jobs.map((job) => <Chip key={job.id} href={shiftLogHref(weeks, { ...filters, job: job.id })} active={filters.job === job.id}>
          <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ background: job.color }} />
          <span className="truncate">{job.name}</span>
        </Chip>)}
      </>}
      <span className="ml-auto flex shrink-0 items-center gap-1">
        {isFiltered(filters) && <Link href={shiftLogHref(weeks, { show: "all", job: "" })} scroll={false} className="inline-flex min-h-9 items-center rounded-full px-3 text-xs font-semibold text-[var(--primary)] underline-offset-4 hover:underline">Clear filters</Link>}
        <ExpandAllWeeks weeks={openableWeeks} />
      </span>
    </nav>}
  </>;
}

/**
 * Google sync's refusals, where the shifts are. The same list the Calendar
 * page shows: each is the user's own job, times and the reason the database
 * gave. Every sync replaces it, so it clears itself once the cause is fixed.
 */
export function SyncIssuesNotice({ issues, timeZone }: { issues: SyncIssue[]; timeZone: string }) {
  if (!issues.length) return null;
  return <details className="group mb-5 rounded-2xl border border-[color-mix(in_srgb,var(--warning)_40%,var(--border))] bg-[color-mix(in_srgb,var(--warning)_8%,var(--card))] px-4 py-3 text-sm">
    <summary className="flex min-h-9 cursor-pointer list-none items-center gap-2.5 font-semibold [&::-webkit-details-marker]:hidden">
      <TriangleAlert className="size-4 shrink-0 text-[var(--warning)]" aria-hidden="true" />
      <span className="flex-1">Google sync couldn&apos;t add {issues.length === 1 ? "1 event as a shift" : `${issues.length} events as shifts`}</span>
      <span className="text-xs font-medium text-[var(--muted-foreground)] group-open:hidden">Show</span>
    </summary>
    <ul className="mt-2 grid gap-1.5 pb-1 text-[var(--muted-foreground)]">
      {issues.map((issue, index) => <li key={index} className="break-words"><span className="font-medium text-[var(--foreground)]">{issue.jobName}</span> · {formatInTimeZone(issue.startsAt, timeZone, "EEE, MMM d, h:mm a")} · {issue.reason}</li>)}
    </ul>
    <p className="pb-1 text-xs text-[var(--muted-foreground)]">Fix the limit or overlap, or add the shift yourself. The list updates on the next sync.</p>
  </details>;
}
