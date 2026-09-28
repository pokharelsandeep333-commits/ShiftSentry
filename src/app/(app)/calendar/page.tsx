import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { AgendaList } from "@/components/calendar/agenda-list";
import { CalendarViewMemory } from "@/components/calendar/calendar-view-memory";
import { MonthGrid } from "@/components/calendar/month-grid";
import { WeekGrid } from "@/components/calendar/week-grid";
import { GoogleSyncTrigger, SyncNowButton } from "@/components/google-sync-trigger";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { loadCalendarPage } from "@/lib/calendar-page-data";
import { resolveCalendarRange } from "@/lib/calendar-range";
import { getSyncIssues, hasSyncingJob } from "@/lib/google/shift-sync";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const linkClass = "font-semibold text-[var(--primary)] underline-offset-4 hover:underline";
const GOOGLE_NOTES = {
  not_connected: <>See your Google Calendar events here too. <Link href="/settings" className={linkClass}>Connect in Settings</Link></>,
  needs_reconnect: <>Google Calendar needs reconnecting. <Link href="/settings" className={linkClass}>Settings</Link></>,
  unavailable: <>Couldn&apos;t load your Google Calendar right now. Your shifts are shown.</>,
};

/**
 * Week or month of the viewer's shifts, with Google events alongside when
 * connected. The view and the date live in the URL, so refresh, back and a
 * shared link all land on the same range; the grid is desktop-only and phones
 * get the same items as a list.
 */
export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ view?: string | string[]; date?: string | string[] }> }) {
  const [profile, params] = await Promise.all([requireUser(), searchParams]);
  const view = typeof params.view === "string" ? params.view : undefined;
  const date = typeof params.date === "string" ? params.date : undefined;
  const range = resolveCalendarRange({ view, date }, new Date(), profile.time_zone, profile.week_starts_on);
  const [{ items, google }, syncing] = await Promise.all([loadCalendarPage(profile, range), hasSyncingJob(profile.id)]);
  const showSync = google === "ok" && syncing;
  const issues = showSync ? await getSyncIssues(profile.id) : [];
  const issueTime = (iso: string) => formatInTimeZone(iso, profile.time_zone, "EEE MMM d, h:mm a");
  const link = (target: { view?: string; date?: string }) => `/calendar?view=${target.view ?? range.view}&date=${target.date ?? range.anchor}`;
  const segment = (active: boolean) => cn("inline-flex h-9 items-center rounded-lg px-3 text-sm font-semibold transition-colors", active ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]");

  return <>
    <CalendarViewMemory view={range.view} explicit={view === "week" || view === "month"} date={date} />
    {showSync && <GoogleSyncTrigger />}
    <PageHeader eyebrow="Schedule" title="Calendar" description="Your shifts, and your Google Calendar when it's connected." actions={<Link href="/shifts/new" className={buttonVariants()}><Plus className="size-4" />Add shift</Link>} />
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2">
        <Link href={link({ date: range.prev })} aria-label={range.view === "week" ? "Previous week" : "Previous month"} className={buttonVariants({ variant: "outline", size: "icon" })}><ChevronLeft className="size-4" /></Link>
        <Link href={link({ date: range.today })} className={buttonVariants({ variant: "outline" })}>Today</Link>
        <Link href={link({ date: range.next })} aria-label={range.view === "week" ? "Next week" : "Next month"} className={buttonVariants({ variant: "outline", size: "icon" })}><ChevronRight className="size-4" /></Link>
        <h2 className="ml-2 truncate font-display text-lg font-semibold">{range.label}</h2>
      </div>
      <nav aria-label="Calendar view" className="inline-flex rounded-xl bg-[var(--surface-subtle)] p-1">
        <Link href={link({ view: "week" })} aria-current={range.view === "week" ? "page" : undefined} className={segment(range.view === "week")}>Week</Link>
        <Link href={link({ view: "month" })} aria-current={range.view === "month" ? "page" : undefined} className={segment(range.view === "month")}>Month</Link>
      </nav>
    </div>
    {google !== "off" && google !== "ok" && <p className="mb-4 text-sm text-[var(--muted-foreground)]">{GOOGLE_NOTES[google]}</p>}
    {showSync && <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
      {issues.length > 0 ? <div className="min-w-0 flex-1 rounded-2xl bg-[color-mix(in_srgb,var(--warning)_12%,transparent)] px-4 py-3 text-sm">
        <p className="font-semibold">Couldn&apos;t add from Google</p>
        <ul className="mt-1 space-y-0.5 text-[var(--muted-foreground)]">{issues.map((issue) => <li key={`${issue.startsAt}-${issue.jobName}`}><b className="font-medium text-[var(--foreground)]">{issue.jobName}</b> · {issueTime(issue.startsAt)} · {issue.reason}</li>)}</ul>
      </div> : <span />}
      <SyncNowButton />
    </div>}
    <div className="hidden lg:block">
      {range.view === "week"
        ? <WeekGrid days={range.days} today={range.today} items={items} timeZone={profile.time_zone} />
        : <MonthGrid days={range.days} today={range.today} month={range.month} items={items} timeZone={profile.time_zone} />}
    </div>
    <div className="lg:hidden"><AgendaList days={range.view === "month" ? range.days.filter((day) => day.slice(0, 7) === range.month) : range.days} today={range.today} items={items} timeZone={profile.time_zone} /></div>
  </>;
}
