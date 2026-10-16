import { CheckCircle2, Database, GitCommitHorizontal, KeyRound, ServerCog, Trash2, XCircle, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import type { Check, SystemHealth } from "@/lib/admin-health";
import { cn } from "@/lib/utils";

function uptime(seconds: number) {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);
  return days ? `${days}d ${hours}h` : hours ? `${hours}h ${minutes}m` : `${minutes}m`;
}

function CheckRow({ icon: Icon, title, check }: { icon: LucideIcon; title: string; check: Check }) {
  return <li className="flex min-w-0 items-center gap-3.5 py-3.5">
    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--surface-subtle)] text-[var(--muted-foreground)]"><Icon className="size-5" aria-hidden="true" /></span>
    <span className="min-w-0 flex-1">
      <span className="block text-sm font-semibold">{title}</span>
      <span className="block text-xs text-[var(--muted-foreground)]">{check.detail}{check.ms !== null && ` · ${check.ms} ms`}</span>
    </span>
    <span className={cn("flex shrink-0 items-center gap-1 text-xs font-semibold", check.ok ? "text-[var(--success)]" : "text-[var(--danger)]")}>
      {check.ok ? <CheckCircle2 className="size-4" aria-hidden="true" /> : <XCircle className="size-4" aria-hidden="true" />}
      {check.ok ? "Healthy" : "Problem"}
    </span>
  </li>;
}

/** Live checks from this server, measured when the page loads. `/admin/health` runs them. */
export function HealthView({ health }: { health: SystemHealth }) {
  const app: Check = { ok: true, ms: null, detail: `Up ${uptime(health.uptimeSeconds)}` };

  return <>
    <PageHeader title="Health" description="Checked from this server when the page loaded. Refresh to check again." />
    <Card>
      <CardContent className="pt-2 sm:pt-3">
        <ul className="divide-y">
          <CheckRow icon={ServerCog} title="App server" check={app} />
          <CheckRow icon={Database} title="Database" check={health.database} />
          <CheckRow icon={KeyRound} title="Supabase Auth" check={health.auth} />
          <CheckRow icon={Trash2} title="Audit log cleanup" check={health.retention} />
          <li className="flex min-w-0 items-center gap-3.5 py-3.5">
            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--surface-subtle)] text-[var(--muted-foreground)]"><GitCommitHorizontal className="size-5" aria-hidden="true" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-semibold">Running commit</span>
              <span className="block break-all font-mono text-xs text-[var(--muted-foreground)]">{health.commit ?? "Not set (local build)"}</span>
            </span>
          </li>
        </ul>
      </CardContent>
    </Card>
  </>;
}
