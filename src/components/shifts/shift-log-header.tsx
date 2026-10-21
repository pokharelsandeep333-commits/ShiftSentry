import Link from "next/link";
import { Plus, TriangleAlert } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
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
    "press inline-flex min-h-9 max-w-full items-center gap-2 whitespace-nowrap rounded-full border px-3 text-xs font-semibold outline-none focus-visible:ring-4 focus-visible:ring-[var(--primary-soft)]",
    active ? "border-[color-mix(in_srgb,var(--primary)_35%,var(--border))] bg-[var(--primary-soft)] text-[var(--primary)]" : "bg-[var(--card)]/60 text-[var(--muted-foreground)] hover:bg-[var(--surface-subtle)] hover:text-[var(--foreground)]",
  )}>{children}</Link>;
}

/**
 * The log's heading, its Add shift button, and the filters. Filters are links
 * that rewrite the address (`?show=`, `?job=`), so a filtered view survives a
 * refresh, a delete (which carries them back) and the back button. The job
 * chips are the active jobs, in their colours.
 */
export function ShiftLogHeader({ weeks, filters, jobs, openableWeeks }: { weeks: number; filters: ShiftFilters; jobs: { id: string; name: string; color: string }[]; openableWeeks: { key: string; defaultOpen: boolean }[] }) {
  return <>
    <PageHeader
      title="Shifts"
      description="Everything you have worked or scheduled, week by week. Open a shift to change it."
      // From sm the header carries a labelled Add shift on every page; below it
      // the header shows only a "+", so the page offers the labelled one.
      actions={jobs.length ? <Link href="/shifts/new" className={cn(buttonVariants(), "sm:hidden")}><Plus className="size-4" aria-hidden="true" />Add shift</Link> : undefined}
    />
    {jobs.length > 0 && <nav aria-label="Filter shifts" className="mb-5 flex flex-wrap items-center gap-2">
      {SHOWS.map((show) => <Chip key={show.value} href={shiftLogHref(weeks, { ...filters, show: show.value })} active={filters.show === show.value}>{show.label}</Chip>)}
      {jobs.length > 1 && <>
        <span aria-hidden="true" className="mx-1 h-5 w-px bg-[var(--border)]" />
        <Chip href={shiftLogHref(weeks, { ...filters, job: "" })} active={!filters.job}>All jobs</Chip>
        {jobs.map((job) => <Chip key={job.id} href={shiftLogHref(weeks, { ...filters, job: job.id })} active={filters.job === job.id}>
          <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ background: job.color }} />
          <span className="truncate">{job.name}</span>
        </Chip>)}
      </>}
      <span className="ml-auto flex items-center gap-1">
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
