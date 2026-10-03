import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { ChevronLeft, ChevronRight, TriangleAlert } from "lucide-react";
import { AgendaList } from "@/components/calendar/agenda-list";
import { CalendarRail } from "@/components/calendar/calendar-rail";
import { CalendarViewMemory } from "@/components/calendar/calendar-view-memory";
import { MiniMonth } from "@/components/calendar/mini-month";
import { MonthGrid } from "@/components/calendar/month-grid";
import { WeekGrid } from "@/components/calendar/week-grid";
import { GoogleSyncTrigger, SyncNowButton } from "@/components/google-sync-trigger";
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
 *
 * Laid out after Google Calendar: on a desktop the page is exactly one screen
 * tall -- it pulls in half the shell's top padding and most of its bottom one,
 * leaving the header plus 2rem, 6.75rem in all -- and the grid takes
 * whatever the toolbar leaves, scrolling its hours inside rather than the page.
 * From `xl` a rail on the left holds Add shift, a month picker and the colour
 * legend; narrower, the grid keeps the width (Add shift is in the shell header).
 * The rail comes after the grid in the DOM, so the keyboard meets the grid first.
 */
export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ view?: string | string[]; date?: string | string[] }> }) {
  const [profile, params] = await Promise.all([requireUser(), searchParams]);
  const view = typeof params.view === "string" ? params.view : undefined;
  const date = typeof params.date === "string" ? params.date : undefined;
  const range = resolveCalendarRange({ view, date }, new Date(), profile.time_zone, profile.week_starts_on);
  const [{ items, google, jobs, calendars }, syncing] = await Promise.all([loadCalendarPage(profile, range), hasSyncingJob(profile.id)]);
  const showSync = google === "ok" && syncing;
  const issues = showSync ? await getSyncIssues(profile.id) : [];
  const issueTime = (iso: string) => formatInTimeZone(iso, profile.time_zone, "EEE MMM d, h:mm a");
  const link = (target: { view?: string; date?: string }) => `/calendar?view=${target.view ?? range.view}&date=${target.date ?? range.anchor}`;
  const segment = (active: boolean) => cn("inline-flex h-9 items-center rounded-full px-4 text-sm lg:h-8 lg:px-3.5 font-semibold transition-colors", active ? "bg-[var(--card)] text-[var(--foreground)] shadow-sm" : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]");
  const stepper = "grid size-11 place-items-center rounded-full lg:size-9 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-subtle)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--primary-soft)]";
  const note = google !== "off" && google !== "ok" ? GOOGLE_NOTES[google] : null;
  const unit = range.view === "week" ? "week" : "month";
  const selectedDays = range.view === "week" ? range.days : [];

  return <>
    <CalendarViewMemory view={range.view} explicit={view === "week" || view === "month"} date={date} />
    {showSync && <GoogleSyncTrigger />}
    <div className="flex flex-col gap-4 lg:-mb-8 lg:-mt-4 lg:h-[calc(100dvh-6.75rem)] lg:min-h-[34rem] xl:grid xl:grid-cols-[13.5rem_minmax(0,1fr)] xl:grid-rows-[minmax(0,1fr)] xl:gap-5">
      <div className="flex min-h-0 min-w-0 flex-col gap-3 lg:gap-2 xl:col-start-2 xl:row-start-1">
        {/* One row on a desktop. On a phone the view switch sits beside the
            title and the date controls take the next row; DOM order stays the
            desktop order, so the keyboard reads it the same either way. Add
            shift is in the shell's header everywhere, and in the rail at xl. */}
        <div className="flex flex-wrap items-center gap-x-2 gap-y-2.5">
          <h1 className="order-1 mr-1 font-display text-2xl font-semibold lg:text-xl">Calendar</h1>
          <div className="order-3 flex w-full min-w-0 items-center gap-1 sm:order-2 sm:w-auto">
            <Link href={link({ date: range.today })} className={cn(buttonVariants({ variant: "outline" }), "mr-1 h-10 rounded-full px-5 lg:h-9 lg:px-4")}>Today</Link>
            <Link href={link({ date: range.prev })} aria-label={`Previous ${unit}`} className={stepper}><ChevronLeft className="size-5" /></Link>
            <Link href={link({ date: range.next })} aria-label={`Next ${unit}`} className={stepper}><ChevronRight className="size-5" /></Link>
            <h2 className="ml-1 min-w-0 truncate font-display text-base font-semibold tabular-nums sm:text-lg">{range.label}</h2>
          </div>
          {/* `contents` on a phone, so its two children take their own rows;
              from sm one right-aligned group that wraps as a unit. */}
          <div className="contents sm:order-3 sm:ml-auto sm:flex sm:flex-wrap sm:items-center sm:justify-end sm:gap-2">
          {showSync && <div className="order-4 flex flex-wrap items-center gap-2 sm:order-1">
            {issues.length > 0 && <details className="relative">
              <summary className="inline-flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,var(--warning)_14%,transparent)] px-3.5 text-sm font-semibold text-[color-mix(in_srgb,var(--warning)_62%,var(--foreground))] [&::-webkit-details-marker]:hidden"><TriangleAlert className="size-4" />{issues.length} not added</summary>
              <div className="absolute left-0 z-40 mt-2 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border bg-[var(--card)] p-4 text-sm shadow-[0_18px_40px_-20px_rgb(16_24_40/0.35)] sm:left-auto sm:right-0">
                <p className="font-semibold">Couldn&apos;t add from Google</p>
                <ul className="mt-1.5 space-y-1 text-[var(--muted-foreground)]">{issues.map((issue, index) => <li key={index}><b className="font-medium text-[var(--foreground)]">{issue.jobName}</b> · {issueTime(issue.startsAt)} · {issue.reason}</li>)}</ul>
              </div>
            </details>}
            <SyncNowButton />
          </div>}
          <nav aria-label="Calendar view" className="order-2 ml-auto inline-flex rounded-full bg-[var(--surface-subtle)] p-1 sm:order-2 sm:ml-0">
            <Link href={link({ view: "week" })} aria-current={range.view === "week" ? "page" : undefined} className={segment(range.view === "week")}>Week</Link>
            <Link href={link({ view: "month" })} aria-current={range.view === "month" ? "page" : undefined} className={segment(range.view === "month")}>Month</Link>
          </nav>
          </div>
        </div>
        {note && <p className="text-sm text-[var(--muted-foreground)] xl:hidden">{note}</p>}
        <div className="hidden min-h-0 flex-1 lg:block">
          {range.view === "week"
            ? <WeekGrid days={range.days} today={range.today} items={items} timeZone={profile.time_zone} />
            : <MonthGrid days={range.days} today={range.today} month={range.month} items={items} timeZone={profile.time_zone} />}
        </div>
        <div className="space-y-4 lg:hidden">
          <details className="group rounded-2xl border bg-[var(--card)]">
            <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3 text-sm font-semibold [&::-webkit-details-marker]:hidden">Jump to a date<ChevronRight className="size-4 text-[var(--muted-foreground)] transition-transform group-open:rotate-90" /></summary>
            <div className="px-3 pb-3"><MiniMonth key={range.anchor.slice(0, 7)} anchor={range.anchor} today={range.today} view={range.view} weekStartsOn={profile.week_starts_on} selectedDays={selectedDays} /></div>
          </details>
          <AgendaList days={range.view === "month" ? range.days.filter((day) => day.slice(0, 7) === range.month) : range.days} today={range.today} items={items} timeZone={profile.time_zone} />
        </div>
      </div>
      <aside aria-label="Calendar tools" className="hidden min-h-0 xl:col-start-1 xl:row-start-1 xl:flex xl:flex-col">
        <CalendarRail range={range} weekStartsOn={profile.week_starts_on} jobs={jobs} calendars={calendars} note={note} />
      </aside>
    </div>
  </>;
}
