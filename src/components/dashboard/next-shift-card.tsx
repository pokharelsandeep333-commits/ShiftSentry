import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { formatMinutes } from "@/lib/utils";
import type { ShiftSummary } from "@/lib/types";
import { addDays } from "@/lib/pay-period";

const MINUTE = 60_000;

/** "Today", "Tomorrow", or the date, by the viewer's own calendar. */
function dayLabel(iso: string, now: Date, timeZone: string, short = false) {
  const day = formatInTimeZone(iso, timeZone, "yyyy-MM-dd");
  const today = formatInTimeZone(now, timeZone, "yyyy-MM-dd");
  const tomorrow = addDays(today, 1);
  if (day === today) return "Today";
  if (day === tomorrow) return "Tomorrow";
  return formatInTimeZone(iso, timeZone, short ? "EEE, MMM d" : "EEEE, MMM d");
}

/** How soon, to the minute while it is close and in days once it is not. */
function startsIn(iso: string, now: Date) {
  const minutes = Math.max(1, Math.round((Date.parse(iso) - now.getTime()) / MINUTE));
  if (minutes < 60) return `Starts in ${minutes} min`;
  if (minutes < 24 * 60) return `Starts in ${formatMinutes(minutes - (minutes % 5))}`;
  const days = Math.round(minutes / (24 * 60));
  return `Starts in ${days} day${days === 1 ? "" : "s"}`;
}

const time = (iso: string, timeZone: string) => formatInTimeZone(iso, timeZone, "h:mm a");

function length(shift: ShiftSummary) {
  return formatMinutes(Math.round((Date.parse(shift.endsAt) - Date.parse(shift.startsAt)) / MINUTE));
}

/** The one shift that matters most right now, in its job's colour. */
function Feature({ shift, live, now, timeZone }: { shift: ShiftSummary; live: boolean; now: Date; timeZone: string }) {
  const start = Date.parse(shift.startsAt);
  const end = Date.parse(shift.endsAt);
  const elapsed = live ? Math.min(100, Math.max(0, ((now.getTime() - start) / (end - start)) * 100)) : 0;
  const left = Math.max(0, Math.round((end - now.getTime()) / MINUTE));

  return <Link href={`/shifts/${shift.id}/edit`} aria-label={`${shift.jobName}, ${dayLabel(shift.startsAt, now, timeZone)} ${time(shift.startsAt, timeZone)} to ${time(shift.endsAt, timeZone)}. Open shift`} className="press group block min-w-0 rounded-2xl border p-4 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--primary)] sm:p-5" style={{ borderColor: `color-mix(in srgb, ${shift.jobColor} 22%, var(--border))`, background: `linear-gradient(140deg, color-mix(in srgb, ${shift.jobColor} 14%, var(--card)), var(--card) 85%)` }}>
    <p className="flex items-center justify-between gap-3 text-sm font-medium text-[var(--muted-foreground)]">
      <span suppressHydrationWarning>{dayLabel(shift.startsAt, now, timeZone)}</span>
      <ArrowRight aria-hidden="true" className="size-4 transition-transform group-hover:translate-x-0.5" />
    </p>
    <p className="mt-2 flex flex-wrap items-baseline gap-x-1.5 font-display text-[clamp(1.2rem,5.5cqw,1.875rem)] font-semibold leading-tight tracking-[-0.03em] tabular-nums"><span className="whitespace-nowrap">{time(shift.startsAt, timeZone)}</span> <span className="text-[var(--muted-foreground)]">–</span> <span className="whitespace-nowrap">{time(shift.endsAt, timeZone)}</span></p>
    <p className="mt-3 grid min-w-0 grid-cols-[auto_minmax(0,1fr)] items-baseline gap-x-2 gap-y-1 text-sm">
      <span aria-hidden="true" className="size-2.5 rounded-full" style={{ background: shift.jobColor }} />
      <span className="min-w-0 break-words font-semibold [overflow-wrap:anywhere]" title={shift.jobName}>{shift.jobName}</span>
    </p>
    {live
      ? <div className="mt-4">
          <span aria-hidden="true" className="flex h-1.5 rounded-full bg-[color-mix(in_srgb,var(--foreground)_8%,transparent)]"><span className="h-full rounded-full" style={{ width: `${elapsed}%`, background: shift.jobColor }} /></span>
          <p className="mt-2 text-xs font-medium text-[var(--muted-foreground)]" suppressHydrationWarning>{length(shift)} shift · {formatMinutes(left)} to go</p>
        </div>
      : <p className="mt-3 text-xs font-medium leading-5 text-[var(--muted-foreground)]" suppressHydrationWarning>{length(shift)} shift · {startsIn(shift.startsAt, now)}</p>}
  </Link>;
}

/**
 * What is next: the shift under way, or else the next one, featured; then the
 * few after it. It used to sit at the bottom of the page as "Coming up", the
 * most useful thing on the dashboard in its least-seen place, and it only
 * looked as far as the end of the week, so a Saturday night showed nothing.
 */
export function NextShiftCard({ current, upcoming, timeZone, snapshotAt }: { current: ShiftSummary | null; upcoming: ShiftSummary[]; timeZone: string; snapshotAt: string }) {
  const now = new Date(snapshotAt);
  const featured = current ?? upcoming[0] ?? null;
  const later = current ? upcoming.slice(0, 3) : upcoming.slice(1, 4);

  return <section aria-labelledby="next-shift-title" className="premium-card @container flex min-w-0 flex-col rounded-[1.35rem] border bg-[var(--card)]/80 p-5 sm:p-6">
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 id="next-shift-title" className="flex items-center gap-2 font-display text-lg font-semibold">
        {current && <span aria-hidden="true" className="relative flex size-2.5"><span className="absolute inset-0 animate-ping rounded-full bg-[var(--success)] opacity-60" /><span className="relative size-2.5 rounded-full bg-[var(--success)]" /></span>}
        {current ? "On shift now" : "Upcoming shifts"}
      </h2>
      <Link href="/shifts?show=upcoming" className="inline-flex min-h-11 shrink-0 items-center rounded-full px-2 text-xs font-semibold text-[var(--primary)] transition-colors hover:bg-[var(--primary-soft)] sm:min-h-9">View all</Link>
    </div>

    {featured
      ? <Feature shift={featured} live={Boolean(current)} now={now} timeZone={timeZone} />
      : <div className="flex flex-col items-start py-2">
          <p className="font-medium">Nothing scheduled yet.</p>
          <p className="mt-1 text-sm leading-6 text-[var(--muted-foreground)]">Planned shifts count toward your week the moment you add them.</p>
        </div>}

    {later.length > 0 && <div className="mt-5">
      <h3 className="text-xs font-semibold text-[var(--muted-foreground)]">{current ? "Coming up" : "Later on"}</h3>
      <ul className="mt-2 divide-y divide-[var(--border)]">
        {later.map((shift) => <li key={shift.id}><Link href={`/shifts/${shift.id}/edit`} className="group flex min-h-11 min-w-0 items-center gap-3 rounded-xl py-3 text-sm transition-colors hover:bg-[var(--surface-subtle)] focus-visible:outline-2 focus-visible:outline-[var(--primary)]">
          <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: shift.jobColor }} />
          <span className="min-w-0 flex-1">
            <span className="block truncate font-semibold" title={shift.jobName}>{shift.jobName}</span>
            <span className="mt-0.5 block text-xs text-[var(--muted-foreground)]" suppressHydrationWarning>{dayLabel(shift.startsAt, now, timeZone, true)} · {length(shift)}</span>
          </span>
          <span className="shrink-0 text-xs font-medium tabular-nums">{time(shift.startsAt, timeZone)}</span>
        </Link></li>)}
      </ul>
    </div>}

  </section>;
}
