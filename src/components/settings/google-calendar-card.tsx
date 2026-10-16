import Link from "next/link";
import { CalendarDays } from "lucide-react";
import { disconnectGoogleCalendar } from "@/app/actions/calendar";
import { CalendarPickerForm } from "@/components/settings/calendar-picker-form";
import { SettingsSection } from "@/components/settings/settings-section";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { listCalendars } from "@/lib/google/client";
import { getConnectionSummary, withCalendarAccess } from "@/lib/google/connection";

const DESCRIPTION = "Read-only. ShiftSentry warns you when a shift overlaps an event and shows what's coming up. It never changes your calendar.";

/** A link, not a form: form-action 'self' would block the redirect to Google. */
function ConnectLink({ label }: { label: string }) {
  return <a href="/integrations/google/connect" className={buttonVariants()}>{label}</a>;
}

/** Streams in under Suspense: listing calendars waits on Google, and the rest of Settings -- and its Save -- must not. */
export function GoogleCalendarCardSkeleton() {
  return <SettingsSection id="google-calendar" icon={CalendarDays} title="Google Calendar" description={DESCRIPTION}>
    <div className="grid gap-3"><div className="skeleton h-5 w-56" /><div className="skeleton h-11" /><div className="skeleton h-11" /></div>
  </SettingsSection>;
}

/** Rendered only when the feature flag is on. */
export async function GoogleCalendarCard({ userId }: { userId: string }) {
  const summary = await getConnectionSummary(userId);
  const calendars = summary?.status === "active" ? await withCalendarAccess(userId, (token) => listCalendars(token)) : null;
  const needsReconnect = summary?.status === "needs_reconnect" || calendars?.status === "needs_reconnect";
  const status = !summary ? <Badge variant="muted">Not connected</Badge>
    : needsReconnect ? <Badge variant="warning">Needs reconnecting</Badge>
    : calendars?.status === "unavailable" ? <Badge variant="muted">Unreachable</Badge>
    : <Badge variant="success">Connected</Badge>;

  return <SettingsSection id="google-calendar" icon={CalendarDays} title="Google Calendar" description={DESCRIPTION} status={status}>
    {!summary ? <div className="grid gap-4">
      <ul className="grid gap-2 text-sm leading-6 text-[var(--muted-foreground)]">
        <li>See your events next to your shifts on the Calendar page.</li>
        <li>Get a warning when a new shift clashes with something you already have.</li>
        <li>Optionally, let a job turn its calendar events into shifts for you.</li>
      </ul>
      <div><ConnectLink label="Connect Google Calendar" /></div>
    </div> : <div className="grid gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[var(--surface-subtle)] px-3.5 py-3">
        <p className="min-w-0 break-words text-sm">Connected as <b>{summary.googleEmail}</b></p>
        <form action={disconnectGoogleCalendar}><ConfirmSubmit label="Disconnect" confirmLabel="Disconnect Google Calendar?" variant="outline" size="sm" /></form>
      </div>
      {needsReconnect && <div className="grid gap-3"><p className="text-sm text-[var(--muted-foreground)]">Access was revoked or has expired. Reconnect to see your events again.</p><div><ConnectLink label="Reconnect" /></div></div>}
      {calendars?.status === "unavailable" && <p className="text-sm text-[var(--muted-foreground)]">Couldn&apos;t reach Google Calendar right now. Your settings are kept; try again in a moment.</p>}
      {calendars?.status === "ok" && <CalendarPickerForm calendars={calendars.value} selected={summary.selectedCalendarIds} />}
      <p className="border-t pt-5 text-xs leading-5 text-[var(--muted-foreground)]">To have a job&apos;s events become shifts automatically, turn that on in the job&apos;s settings on <Link href="/jobs" className="font-semibold text-[var(--primary)] underline-offset-4 hover:underline">Jobs</Link>.</p>
    </div>}
  </SettingsSection>;
}
