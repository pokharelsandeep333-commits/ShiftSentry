import Link from "next/link";
import { ChevronLeft, ChevronRight, Download } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { PremiumSelect } from "@/components/ui/premium-select";
import { AuditList } from "@/components/admin/audit-list";
import { AUDIT_ACTIONS, AUDIT_PAGE_SIZE, AUDIT_WINDOW_DAYS, auditHref, type AuditFilters } from "@/lib/admin-audit";
import type { AuditRow } from "@/lib/admin-audit-server";

const DAY_LABELS: Record<number, string> = { 1: "Last 24 hours", 7: "Last 7 days", 30: "Last 30 days" };

/**
 * The audit log: filters in the URL (a GET form, so a filtered view can be
 * shared), pages of 50, and a CSV download of exactly what is filtered. The
 * download is a POST so a link or a prefetch cannot trigger it, and it writes
 * its own audit row.
 */
export function AuditView({ rows, total, filters, admins, timeZone }: { rows: AuditRow[]; total: number; filters: AuditFilters; admins: { id: string; email: string }[]; timeZone: string }) {
  const pages = Math.max(1, Math.ceil(total / AUDIT_PAGE_SIZE));
  const from = total ? (filters.page - 1) * AUDIT_PAGE_SIZE + 1 : 0;
  const to = Math.min(total, filters.page * AUDIT_PAGE_SIZE);
  const filtered = Boolean(filters.action || filters.actor || filters.target || filters.days !== AUDIT_WINDOW_DAYS);

  return <>
    <PageHeader
      title="Audit log"
      description={`Every admin action on an account, kept for ${AUDIT_WINDOW_DAYS} days and then deleted by the daily cleanup. A downloaded CSV includes account emails and is outside that cleanup, so delete it when you are done.`}
      actions={<form method="post" action="/admin/audit/export">
        {filters.action && <input type="hidden" name="action" value={filters.action} />}
        {filters.actor && <input type="hidden" name="actor" value={filters.actor} />}
        {filters.target && <input type="hidden" name="target" value={filters.target} />}
        <input type="hidden" name="days" value={filters.days} />
        <button type="submit" disabled={!total} className="press flex h-11 items-center gap-2 rounded-xl border px-4 text-sm font-semibold hover:bg-[var(--surface-subtle)] disabled:opacity-50"><Download className="size-4" aria-hidden="true" />Download CSV</button>
      </form>}
    />

    <Card className="mb-4">
      <CardContent className="pt-5 sm:pt-6">
        <form action="/admin/audit" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_1fr_1fr_auto] xl:items-end">
          <div className="field-label text-xs">
            <span id="audit-action">Action</span>
            <PremiumSelect name="action" labelledBy="audit-action" defaultValue={filters.action} options={[{ value: "", label: "Any action" }, ...Object.entries(AUDIT_ACTIONS).map(([value, { label }]) => ({ value, label }))]} />
          </div>
          <div className="field-label text-xs">
            <span id="audit-actor">Admin</span>
            <PremiumSelect name="actor" labelledBy="audit-actor" defaultValue={filters.actor} options={[{ value: "", label: "Any admin" }, ...admins.map((admin) => ({ value: admin.id, label: admin.email }))]} />
          </div>
          <label className="field-label text-xs">
            <span>Account email</span>
            <input name="target" type="search" defaultValue={filters.target} maxLength={100} placeholder="Any account" className="field-control" />
          </label>
          <div className="field-label text-xs">
            <span id="audit-days">When</span>
            <PremiumSelect name="days" labelledBy="audit-days" defaultValue={String(filters.days)} options={Object.entries(DAY_LABELS).map(([value, label]) => ({ value, label }))} />
          </div>
          <div className="flex gap-2 sm:col-span-2 xl:col-span-1">
            <button type="submit" className="press h-11 flex-1 rounded-xl bg-[var(--primary)] px-4 text-sm font-semibold text-[var(--primary-foreground)] xl:flex-none">Apply</button>
            {filtered && <Link href="/admin/audit" className="press flex h-11 items-center rounded-xl border px-4 text-sm font-semibold hover:bg-[var(--surface-subtle)]">Clear</Link>}
          </div>
        </form>
      </CardContent>
    </Card>

    <Card>
      <CardContent className="p-2 sm:p-3"><AuditList rows={rows} timeZone={timeZone} empty={filtered ? "No events match these filters." : undefined} /></CardContent>
    </Card>

    <nav aria-label="Pages" className="mt-4 flex items-center justify-between gap-3 text-sm text-[var(--muted-foreground)]">
      <span>{total ? `${from}–${to} of ${total}` : "No events"}</span>
      <span className="flex gap-2">
        {filters.page > 1 && <Link href={auditHref(filters, { page: filters.page - 1 })} className="press flex h-9 items-center gap-1 rounded-xl border px-3 font-semibold hover:bg-[var(--surface-subtle)]"><ChevronLeft className="size-4" aria-hidden="true" />Newer</Link>}
        {filters.page < pages && <Link href={auditHref(filters, { page: filters.page + 1 })} className="press flex h-9 items-center gap-1 rounded-xl border px-3 font-semibold hover:bg-[var(--surface-subtle)]">Older<ChevronRight className="size-4" aria-hidden="true" /></Link>}
      </span>
    </nav>
  </>;
}
