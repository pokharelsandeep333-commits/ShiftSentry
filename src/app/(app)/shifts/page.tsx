import Link from "next/link";
import { CalendarClock, ChevronRight, Clock3 } from "lucide-react";
import { addDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { PageHeader } from "@/components/page-header";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { SavedToast } from "@/components/saved-toast";
import { ShiftRowActions } from "@/components/shifts/shift-row-actions";
import { formatCents } from "@/lib/earnings";
import { addWeeksToLocalDateTime } from "@/lib/shift-date-time";
import { weekStartFor } from "@/lib/time";
import { WEEKS_PER_PAGE, clampWeeks } from "@/lib/shift-log";
import { formatMinutes } from "@/lib/utils";

export const dynamic = "force-dynamic";

type JobRef = { name: string; color: string; archived_at: string | null };

type ShiftRow = {
  id: string;
  job_id: string;
  starts_at: string;
  ends_at: string;
  notes: string | null;
  net_cents: number | null;
  jobs: JobRef | JobRef[] | null;
};

type SearchParams = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function nextWeekLocal(value: string, timeZone: string) {
  return addWeeksToLocalDateTime(formatInTimeZone(value, timeZone, "yyyy-MM-dd'T'HH:mm"), 1);
}

/** Reports what a weekly repeat actually managed to create. */
function createdMessage(created: number, skipped: number) {
  if (!created) return "";
  const added = created === 1 ? "Shift added" : `${created} shifts added`;
  if (!skipped) return added;
  return `${added}. ${skipped} skipped — they clash with an existing shift or a weekly cap.`;
}

/** What a mutation that redirected back here should confirm. */
function savedMessage(params: SearchParams) {
  if (single(params.saved) === "shift-deleted") return "Shift deleted";
  return createdMessage(Number(params.created ?? 0), Number(params.skipped ?? 0));
}

function duplicateHref(shift: ShiftRow, timeZone: string) {
  const params = new URLSearchParams({ jobId: shift.job_id, startsAt: nextWeekLocal(shift.starts_at, timeZone), endsAt: nextWeekLocal(shift.ends_at, timeZone) });
  if (shift.notes) params.set("notes", shift.notes);
  return `/shifts/new?${params.toString()}`;
}

function shiftMinutes(shift: ShiftRow) {
  return Math.round((new Date(shift.ends_at).getTime() - new Date(shift.starts_at).getTime()) / 60000);
}

type WeekGroup = { key: string; start: Date; shifts: ShiftRow[]; minutes: number; netCents: number };

/**
 * Group by the week a shift *starts* in, honouring the profile's `week_starts_on`.
 * An overnight shift crossing the boundary counts wholly to its starting week --
 * unlike the dashboard, which splits minutes across days, this list exists to
 * find a shift again, and one appearing under two weeks would be worse than one
 * appearing slightly early.
 */
function groupByWeek(shifts: ShiftRow[], timeZone: string, weekStartsOn: number) {
  const groups = new Map<string, WeekGroup>();

  for (const shift of shifts) {
    const start = weekStartFor(new Date(shift.starts_at), timeZone, weekStartsOn);
    const key = start.toISOString();
    const group = groups.get(key) ?? { key, start, shifts: [], minutes: 0, netCents: 0 };
    group.shifts.push(shift);
    group.minutes += shiftMinutes(shift);
    group.netCents += shift.net_cents ?? 0;
    groups.set(key, group);
  }

  // Shifts arrive newest first, so insertion order is already newest week first.
  return [...groups.values()];
}

export default async function ShiftsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const profile = await requireUser();
  const params = await searchParams;
  const saved = savedMessage(params);
  const weeks = clampWeeks(single(params.weeks));

  const currentWeekStart = weekStartFor(new Date(), profile.time_zone, profile.week_starts_on);
  const windowStart = addDays(currentWeekStart, -7 * (weeks - 1));

  const supabase = await createServerSupabaseClient();
  // No upper bound: scheduled future shifts always belong on this page. The
  // second query only asks whether anything older exists, so "Load older weeks"
  // never appears when it would do nothing.
  const [{ data: shifts }, { count: olderCount }, { data: weeksBefore }] = await Promise.all([
    supabase.from("shifts").select("id,job_id,starts_at,ends_at,notes,net_cents,jobs(name,color,archived_at)").eq("user_id", profile.id).gte("starts_at", windowStart.toISOString()).order("starts_at", { ascending: false }),
    supabase.from("shifts").select("id", { count: "exact", head: true }).eq("user_id", profile.id).lt("starts_at", windowStart.toISOString()),
    supabase.rpc("shift_week_count_before", { p_time_zone: profile.time_zone, p_week_starts_on: profile.week_starts_on, p_before: windowStart.toISOString() }),
  ]);

  const groups = groupByWeek((shifts ?? []) as ShiftRow[], profile.time_zone, profile.week_starts_on);
  const currentKey = currentWeekStart.toISOString();

  // `windowStart` is itself a week start, so no week straddles it: every week
  // before it is counted by the RPC, and every week in `groups` comes after.
  // `groups` is newest-first, so the last one is the oldest week loaded and
  // takes the first number after that count.
  //
  // The `?? 0` also degrades gracefully if the migration adding the function
  // has not been applied yet: the log still renders, numbered from week 1
  // within the window, rather than the page failing outright.
  const firstWeekNumber = (weeksBefore ?? 0) + 1;

  return <>
    {saved && <SavedToast message={saved} clearParams={["created", "skipped", "saved"]} />}
    <PageHeader eyebrow="Shift log" title="All shifts" description="Grouped by your week. Future entries are included in projected cap warnings." actions={<Link href="/shifts/new" className={buttonVariants()}><CalendarClock className="size-4" />Add shift</Link>} />

    {groups.length
      ? <div className="space-y-3">{groups.map((group, index) => <WeekSection key={group.key} group={group} number={firstWeekNumber + groups.length - 1 - index} open={group.key === currentKey} timeZone={profile.time_zone} weeks={weeks} />)}</div>
      : <Card><CardContent><p className="p-10 text-center text-sm text-[var(--muted-foreground)]">No shifts in the last {weeks} weeks.</p></CardContent></Card>}

    {olderCount ? <div className="mt-6 text-center">
      <Link href={`/shifts?weeks=${clampWeeks(weeks + WEEKS_PER_PAGE)}`} className={buttonVariants({ variant: "outline" })}>
        Load older weeks <span className="font-normal text-[var(--muted-foreground)]">({olderCount} older)</span>
      </Link>
    </div> : null}
  </>;
}

function WeekSection({ group, number, open, timeZone, weeks }: { group: WeekGroup; number: number; open: boolean; timeZone: string; weeks: number }) {
  const lastDay = addDays(group.start, 6);
  const range = `${formatInTimeZone(group.start, timeZone, "MMM d")} – ${formatInTimeZone(lastDay, timeZone, "MMM d")}`;

  return <Card>
    <CardContent className="p-2 sm:p-3">
      {/* <details> keeps this a server component: no client JS, and the summary is
          focusable and toggles on Enter/Space for free. */}
      <details open={open} className="group">
        <summary className="flex cursor-pointer list-none items-center gap-3 rounded-2xl p-3 transition-colors hover:bg-[var(--surface-subtle)] [&::-webkit-details-marker]:hidden">
          <ChevronRight className="size-4 shrink-0 text-[var(--muted-foreground)] transition-transform duration-200 group-open:rotate-90" />
          <span className="min-w-0 flex-1 font-display font-semibold">Week {number}<span className="ml-2 font-sans text-sm font-medium text-[var(--muted-foreground)]">{range}</span></span>
          <span className="shrink-0 rounded-xl bg-[var(--surface-subtle)] px-3 py-1.5 text-sm font-semibold">{formatMinutes(group.minutes)}</span>
          <span className="shrink-0 text-sm font-semibold text-[var(--success)]">{formatCents(group.netCents)}</span>
        </summary>
        <div className="mt-1 space-y-1">{group.shifts.map((shift) => <ShiftListRow key={shift.id} shift={shift} timeZone={timeZone} weeks={weeks} />)}</div>
      </details>
    </CardContent>
  </Card>;
}

function ShiftListRow({ shift, timeZone, weeks }: { shift: ShiftRow; timeZone: string; weeks: number }) {
  const job = Array.isArray(shift.jobs) ? shift.jobs[0] : shift.jobs;
  const future = new Date(shift.starts_at) > new Date();

  return <div className="flex flex-wrap items-center gap-4 rounded-2xl p-3.5 transition-colors hover:bg-[var(--surface-subtle)] sm:p-4">
    <span className="grid size-10 place-items-center rounded-xl" style={{ background: `${job?.color ?? "#98a2b3"}22`, color: job?.color ?? "#98a2b3" }}><Clock3 className="size-4" /></span>
    <div className="min-w-48 flex-1"><p className="font-semibold">{job?.name ?? "Archived job"}</p><p className="mt-1 text-sm text-[var(--muted-foreground)]">{formatInTimeZone(shift.starts_at, timeZone, "EEE, MMM d · h:mm a")} – {formatInTimeZone(shift.ends_at, timeZone, "h:mm a")}</p>{shift.notes && <p className="mt-1.5 line-clamp-1 text-sm text-[var(--muted-foreground)]">{shift.notes}</p>}</div>
    <span className="rounded-xl bg-[var(--surface-subtle)] px-3 py-1.5 text-sm font-semibold">{formatMinutes(shiftMinutes(shift))}</span>
    <Badge variant={future ? "default" : "muted"} className="rounded-xl px-3 py-1.5">{future ? "Scheduled" : "Logged"}</Badge>
    <ShiftRowActions
      shiftId={shift.id}
      editHref={`/shifts/${shift.id}/edit`}
      duplicateHref={job && !job.archived_at ? duplicateHref(shift, timeZone) : undefined}
      weeks={weeks}
    />
  </div>;
}
