import Link from "next/link";
import { ArrowUpRight, Plus } from "lucide-react";
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
  if (minutes < 60) return `in ${minutes} min`;
  if (minutes < 24 * 60) return `in ${formatMinutes(minutes - (minutes % 5))}`;
  const days = Math.round(minutes / (24 * 60));
  return `in ${days} day${days === 1 ? "" : "s"}`;
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

  return <Link href={`/shifts/${shift.id}/edit`} aria-label={`${shift.jobName}, ${dayLabel(shift.startsAt, now, timeZone)} ${time(shift.startsAt, timeZone)} to ${time(shift.endsAt, timeZone)}. Open shift`} className="press group block min-w-0 rounded-2xl border p-4 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[var(--primary)] sm:p-5" style={{ borderColor: `color-mix(in srgb, ${shift.jobColor} 24%, var(--border))`, background: `linear-gradient(140deg, color-mix(in srgb, ${shift.jobColor} 14%, var(--card)), var(--card) 85%)` }}>
    <p className="flex items-center justify-between gap-3 text-sm">
      <span className="font-medium" suppressHydrationWarning>{dayLabel(shift.startsAt, now, timeZone)}</span>
      <span className="text-xs font-medium text-[var(--muted-foreground)]" suppressHydrationWarning>{live ? `${formatMinutes(left)} to go` : startsIn(shift.startsAt, now)}</span>
    </p>
    <p className="mt-2 flex flex-wrap items-baseline gap-x-1.5 font-display text-[clamp(1.2rem,5.5cqw,1.75rem)] font-semibold leading-tight tracking-[-0.03em] tabular-nums"><span className="whitespace-nowrap">{time(shift.startsAt, timeZone)}</span> <span className="text-[var(--muted-foreground)]">–</span> <span className="whitespace-nowrap">{time(shift.endsAt, timeZone)}</span></p>
    <p className="mt-3 flex min-w-0 items-center gap-2 text-sm">
      <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ background: shift.jobColor }} />
      <span className="min-w-0 truncate font-semibold" title={shift.jobName}>{shift.jobName}</span>
      <span className="shrink-0 text-[var(--muted-foreground)]">· {length(shift)}</span>
    </p>
    {live && <span aria-hidden="true" className="mt-4 flex h-1.5 rounded-full bg-[color-mix(in_srgb,var(--foreground)_8%,transparent)]"><span className="h-full rounded-full" style={{ width: `${elapsed}%`, background: shift.jobColor }} /></span>}
  </Link>;
}

/**
 * What is next: the shift under way, or else the next one, featured; then the
 * few after it, reaching past this week so a Saturday night still shows the
 * Monday ahead.
 */
export function NextShiftCard({ current, upcoming, timeZone, snapshotAt }: { current: ShiftSummary | null; upcoming: ShiftSummary[]; timeZone: string; snapshotAt: string }) {
  const now = new Date(snapshotAt);
  const featured = current ?? upcoming[0] ?? null;
  const later = current ? upcoming.slice(0, 3) : upcoming.slice(1, 4);

  return <section aria-labelledby="next-shift-title" className="@container flex min-w-0 flex-col">
    <div className="mb-4 flex items-center justify-between gap-3">
      <h2 id="next-shift-title" className="flex items-center gap-2 font-display text-lg font-semibold">
        {current && <span aria-hidden="true" className="relative flex size-2.5"><span className="absolute inset-0 animate-ping rounded-full bg-[var(--success)] opacity-60" /><span className="relative size-2.5 rounded-full bg-[var(--success)]" /></span>}
        {current ? "On shift now" : "Up next"}
      </h2>
      {featured && <Link href="/shifts?show=upcoming" className="-mr-2 inline-flex min-h-11 shrink-0 items-center gap-1 rounded-full px-2 text-xs font-semibold text-[var(--primary)] transition-colors hover:bg-[var(--primary-soft)] sm:min-h-8">All<ArrowUpRight aria-hidden="true" className="size-3.5" /></Link>}
    </div>

    {featured
      ? <Feature shift={featured} live={Boolean(current)} now={now} timeZone={timeZone} />
      : <Link href="/shifts/new" className="press group flex min-h-24 items-center justify-center gap-2 rounded-2xl border border-dashed text-sm font-semibold text-[var(--muted-foreground)] transition-colors hover:border-[color-mix(in_srgb,var(--primary)_45%,var(--border))] hover:text-[var(--primary)]"><Plus aria-hidden="true" className="size-4" />Plan a shift</Link>}

    {later.length > 0 && <ul className="mt-2">
      {later.map((shift) => <li key={shift.id}><Link href={`/shifts/${shift.id}/edit`} className="-mx-2 grid min-h-12 min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl px-2 py-2.5 text-sm transition-colors hover:bg-[var(--surface-subtle)] focus-visible:outline-2 focus-visible:outline-[var(--primary)]">
        <span aria-hidden="true" className="size-2 rounded-full" style={{ background: shift.jobColor }} />
        <span className="min-w-0">
          <span className="block truncate font-medium" title={shift.jobName}>{shift.jobName}</span>
          <span className="block text-xs text-[var(--muted-foreground)]" suppressHydrationWarning>{dayLabel(shift.startsAt, now, timeZone, true)}</span>
        </span>
        <span className="text-right text-xs tabular-nums">
          <span className="block font-semibold">{time(shift.startsAt, timeZone)}</span>
          <span className="block text-[var(--muted-foreground)]">{length(shift)}</span>
        </span>
      </Link></li>)}
    </ul>}
  </section>;
}
