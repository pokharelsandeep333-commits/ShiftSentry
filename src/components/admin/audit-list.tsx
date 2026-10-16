import Link from "next/link";
import { formatInTimeZone } from "date-fns-tz";
import { auditActionLabel, describeAuditEvent } from "@/lib/admin-audit";
import type { AuditRow } from "@/lib/admin-audit-server";

/**
 * Audit events as sentences ("ava@x disabled sam@y") with the time in the
 * viewing admin's zone. A target that still exists links to its user page.
 */
export function AuditList({ rows, timeZone, empty = "No admin activity recorded in the last 30 days." }: { rows: AuditRow[]; timeZone: string; empty?: string }) {
  if (!rows.length) return <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-[var(--muted-foreground)]">{empty}</p>;

  return <ol className="grid gap-1">
    {rows.map((row) => <li key={row.id} className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-xl px-3 py-2.5 hover:bg-[var(--surface-subtle)]">
      <span className="min-w-0 flex-1 basis-64 break-words text-sm">
        {describeAuditEvent(row.action, row.actor, null)}
        {row.target && <> {row.targetUserId && row.target !== "a deleted account"
          ? <Link href={`/admin/users/${row.targetUserId}`} className="font-semibold text-[var(--primary)] underline-offset-4 hover:underline">{row.target}</Link>
          : <span className="font-semibold">{row.target}</span>}</>}
      </span>
      <span className="flex shrink-0 items-center gap-2 text-xs text-[var(--muted-foreground)]">
        <span className="rounded-full bg-[var(--surface-subtle)] px-2 py-0.5 font-semibold">{auditActionLabel(row.action)}</span>
        <time dateTime={row.createdAt.toISOString()}>{formatInTimeZone(row.createdAt, timeZone, "MMM d, h:mm a")}</time>
      </span>
    </li>)}
  </ol>;
}
