import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AuditList } from "@/components/admin/audit-list";
import { StatTile, UsageChart } from "@/components/admin/usage-chart";
import type { AuditRow } from "@/lib/admin-audit-server";
import type { UsageStats } from "@/lib/admin-stats";

function percent(part: number, whole: number) {
  return whole ? `${Math.round((part / whole) * 100)}%` : "0%";
}

/**
 * The admin overview: platform totals, two trend charts, what needs a look,
 * and the latest admin activity. `/admin` loads the data; this draws it.
 */
export function AdminOverview({ stats, recent, timeZone }: { stats: UsageStats; recent: AuditRow[]; timeZone: string }) {
  const attention = [
    { count: stats.google.needsReconnect, label: "Google Calendar connections need reconnecting", href: "/admin/integrations" },
    { count: stats.pendingDeletion, label: "account deletions are stuck pending", href: "/admin/users?status=pending" },
    { count: stats.disabled, label: "accounts are disabled", href: "/admin/users?status=disabled" },
  ].filter((item) => item.count > 0);
  const notAccepted = stats.accounts - stats.acceptedCurrentTerms;

  return <>
    <PageHeader title="Admin overview" description="Totals across every account. Nothing on this page shows one person's data." />

    <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      <StatTile label="Accounts" value={stats.accounts} />
      <StatTile label="Active this week" value={stats.activeThisWeek} detail={`${percent(stats.activeThisWeek, stats.accounts)} added a shift`} />
      <StatTile label="Shifts added" value={stats.shiftsLast30Days} detail="Last 30 days" />
      <StatTile label="Google connected" value={stats.google.active + stats.google.needsReconnect} detail={stats.google.needsReconnect ? `${stats.google.needsReconnect} need reconnecting` : "All healthy"} />
      <StatTile label="Current Terms" value={percent(stats.acceptedCurrentTerms, stats.accounts)} detail={`${stats.acceptedCurrentTerms} of ${stats.accounts} accepted`} />
      <StatTile label="Disabled" value={stats.disabled} />
    </div>

    <div className="mb-6 grid gap-6 lg:grid-cols-2">
      <Card><CardContent className="pt-5 sm:pt-6"><UsageChart title="Sign-ups per week" caption="12 weeks, UTC" data={stats.signupsByWeek} unit={["sign-up", "sign-ups"]} /></CardContent></Card>
      <Card><CardContent className="pt-5 sm:pt-6"><UsageChart title="Shifts added per day" caption="30 days, UTC" data={stats.shiftsByDay} unit={["shift", "shifts"]} /></CardContent></Card>
    </div>

    <div className="grid gap-6 lg:grid-cols-[0.8fr_1.2fr]">
      <Card className="h-fit">
        <CardHeader><CardTitle>Needs attention</CardTitle></CardHeader>
        <CardContent className="grid gap-2">
          {attention.length ? attention.map((item) => <Link key={item.href} href={item.href} className="press group flex items-center gap-3 rounded-xl border border-[color-mix(in_srgb,var(--warning)_35%,var(--border))] bg-[color-mix(in_srgb,var(--warning)_8%,transparent)] px-3.5 py-3 text-sm outline-none focus-visible:ring-4 focus-visible:ring-[var(--primary-soft)]">
            <AlertTriangle className="size-4 shrink-0 text-[var(--warning)]" aria-hidden="true" />
            <span className="min-w-0 flex-1"><span className="font-semibold tabular-nums">{item.count}</span> {item.label}</span>
            <ArrowRight className="size-4 shrink-0 text-[var(--muted-foreground)] transition-[translate] group-hover:translate-x-0.5" aria-hidden="true" />
          </Link>)
            : <p className="flex items-center gap-2 rounded-xl bg-[var(--surface-subtle)] px-3.5 py-3 text-sm text-[var(--muted-foreground)]"><CheckCircle2 className="size-4 text-[var(--success)]" aria-hidden="true" />All clear.</p>}
          {notAccepted > 0 && <p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">{notAccepted} account{notAccepted === 1 ? " hasn't" : "s haven't"} accepted the current Terms yet. They are asked on their next visit; nothing for you to do.</p>}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-3">Recent admin activity<Link href="/admin/audit" className="text-sm font-semibold text-[var(--primary)] underline-offset-4 hover:underline">Audit log</Link></CardTitle>
        </CardHeader>
        <CardContent><AuditList rows={recent} timeZone={timeZone} /></CardContent>
      </Card>
    </div>
  </>;
}
