import { CalendarDays } from "lucide-react";
import { disconnectGoogleCalendar } from "@/app/actions/calendar";
import { CalendarPickerForm } from "@/components/settings/calendar-picker-form";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { listCalendars } from "@/lib/google/client";
import { getConnectionSummary, withCalendarAccess } from "@/lib/google/connection";

const connectLink = <a href="/integrations/google/connect" className={buttonVariants()}>Connect Google Calendar</a>;

function CardShell({ children }: { children: React.ReactNode }) {
  return <Card className="max-w-2xl">
    <CardHeader>
      <CardTitle className="flex items-center gap-2"><CalendarDays className="size-5 text-[var(--primary)]" />Google Calendar</CardTitle>
      <CardDescription>Read-only. ShiftSentry warns you when a shift overlaps an event and shows what&apos;s coming up. It never changes your calendar.</CardDescription>
    </CardHeader>
    <CardContent className="grid gap-5">{children}</CardContent>
  </Card>;
}

/** Streams in under Suspense: listing calendars waits on Google, and the rest of Settings -- and its Save -- must not. */
export function GoogleCalendarCardSkeleton() {
  return <CardShell><div className="skeleton h-5 w-56" /><div className="skeleton h-11" /><div className="skeleton h-11" /></CardShell>;
}

/** Rendered only when the feature flag is on. A link, not a form: form-action 'self' would block the redirect to Google. */
export async function GoogleCalendarCard({ userId }: { userId: string }) {
  const summary = await getConnectionSummary(userId);
  const calendars = summary?.status === "active" ? await withCalendarAccess(userId, (token) => listCalendars(token)) : null;

  return <CardShell>
      {!summary && connectLink}
      {summary && <p className="text-sm">Connected as <b>{summary.googleEmail}</b></p>}
      {(summary?.status === "needs_reconnect" || calendars?.status === "needs_reconnect") && <div className="grid gap-3"><p className="text-sm text-[var(--muted-foreground)]">Google Calendar needs reconnecting. Access was revoked or has expired.</p><div><a href="/integrations/google/connect" className={buttonVariants()}>Reconnect</a></div></div>}
      {calendars?.status === "unavailable" && <p className="text-sm text-[var(--muted-foreground)]">Couldn&apos;t reach Google Calendar right now.</p>}
      {calendars?.status === "ok" && summary && <CalendarPickerForm calendars={calendars.value} selected={summary.selectedCalendarIds} />}
      {summary && <form action={disconnectGoogleCalendar} className="border-t pt-5"><ConfirmSubmit label="Disconnect" confirmLabel="Disconnect Google Calendar?" variant="outline" /></form>}
  </CardShell>;
}
