import { formatInTimeZone } from "date-fns-tz";
import { CalendarDays } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatTile } from "@/components/admin/usage-chart";
import type { GoogleHealth } from "@/lib/admin-integrations";

const FEATURE: Record<GoogleHealth["feature"], { badge: React.ReactNode; text: string }> = {
  on: { badge: <Badge variant="success">On</Badge>, text: "Users can connect a calendar, see their events and sync shifts." },
  off: { badge: <Badge variant="muted">Off</Badge>, text: "GOOGLE_CALENDAR_ENABLED is not true, so every Google page and route returns 404." },
  misconfigured: { badge: <Badge variant="danger">Misconfigured</Badge>, text: "The flag is on but the client id, client secret or 32-byte encryption key is missing or invalid, so Google stays off. Check the server's environment." },
};

/** Google Calendar across all accounts, as counts and reasons. `/admin/integrations` loads it. */
export function IntegrationsView({ google, timeZone }: { google: GoogleHealth; timeZone: string }) {
  const total = google.connections.active + google.connections.needsReconnect;

  return <>
    <PageHeader title="Integrations" description="How connected services are doing across all accounts. Counts and reasons only: no event titles, job names or times." />

    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2"><CalendarDays className="size-5 text-[var(--primary)]" aria-hidden="true" />Google Calendar {FEATURE[google.feature].badge}</CardTitle>
        <p className="text-sm text-[var(--muted-foreground)]">{FEATURE[google.feature].text}</p>
      </CardHeader>
      <CardContent className="grid gap-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <StatTile label="Connected accounts" value={total} />
          <StatTile label="Need reconnecting" value={google.connections.needsReconnect} detail="Access revoked or expired" />
          <StatTile label="Jobs syncing shifts" value={google.syncingJobs} detail="Active jobs only" />
          <StatTile label="Accounts with sync issues" value={google.accountsWithIssues} />
        </div>

        <div className="grid gap-2">
          <p className="text-sm font-semibold">Sync issues by reason</p>
          <p className="text-xs leading-5 text-[var(--muted-foreground)]">Events that sync could not turn into shifts or update, for example because the shift would break a weekly limit, overlap another shift or run over 24 hours. Each account sees its own on its Calendar page, and every sync replaces the list.</p>
          {google.issues.length ? <ul className="grid gap-1.5">
            {google.issues.map((issue) => <li key={issue.reason} className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-xl bg-[var(--surface-subtle)] px-3.5 py-2.5 text-sm">
              <span className="min-w-0 flex-1 basis-64 break-words">{issue.reason}</span>
              <span className="shrink-0 text-xs text-[var(--muted-foreground)]"><span className="font-semibold tabular-nums text-[var(--foreground)]">{issue.count}</span> · latest {formatInTimeZone(issue.latest, timeZone, "MMM d, h:mm a")}</span>
            </li>)}
          </ul> : <p className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-[var(--muted-foreground)]">No sync issues right now.</p>}
        </div>
      </CardContent>
    </Card>
  </>;
}
