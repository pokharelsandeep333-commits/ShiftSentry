import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AccountActions } from "@/components/admin/account-actions";
import { AuditList } from "@/components/admin/audit-list";
import { DeleteAccount } from "@/components/admin/delete-account";
import { SupportNotes } from "@/components/admin/support-notes";
import type { AuditRow } from "@/lib/admin-audit-server";

export type AdminUserDetail = {
  id: string;
  email: string;
  displayName: string | null;
  role: "USER" | "ADMIN";
  disabledAt: Date | null;
  deletionPendingAt: Date | null;
  createdAt: Date;
  /** From Auth; null when the Auth lookup failed, so the page still renders. */
  lastSignInAt: Date | null;
  providers: string[] | null;
  acceptedVersion: string | null;
  currentVersion: string;
  google: "active" | "needs_reconnect" | null;
  counts: { jobs: number; shifts: number; weekNotes: number; rooms: number | null };
};

const PROVIDER_LABELS: Record<string, string> = { email: "Email and password", google: "Google", github: "GitHub" };

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="flex min-w-0 items-baseline justify-between gap-4 py-2.5 text-sm">
    <dt className="shrink-0 text-[var(--muted-foreground)]">{label}</dt>
    <dd className="min-w-0 text-right font-medium">{children}</dd>
  </div>;
}

function Count({ label, value }: { label: string; value: number | null }) {
  return <div className="rounded-xl bg-[var(--surface-subtle)] px-3 py-2.5">
    <p className="font-display text-xl font-semibold tabular-nums">{value ?? "–"}</p>
    <p className="text-xs text-[var(--muted-foreground)]">{label}</p>
  </div>;
}

/**
 * One account, as support sees it: facts about the account and counts of what
 * it holds, never the contents. No job names, shift times, notes or earnings:
 * support rarely needs them, and the Privacy Policy promises admins only
 * "account details and work summaries".
 */
export function AdminUserView({ user, audit, notes, timeZone, isSelf }: { user: AdminUserDetail; audit: AuditRow[]; notes: { id: string; body: string; author: string | null; createdAt: Date }[]; timeZone: string; isSelf: boolean }) {
  const when = (date: Date) => formatInTimeZone(date, timeZone, "MMM d, yyyy, h:mm a");
  const status = user.deletionPendingAt ? <Badge variant="warning">Deletion pending</Badge> : user.disabledAt ? <Badge variant="danger">Disabled</Badge> : <Badge variant="success">Active</Badge>;

  return <>
    <Link href="/admin/users" className="-ml-2 mb-3 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-sm font-semibold text-[var(--muted-foreground)] outline-none hover:text-[var(--foreground)] focus-visible:ring-4 focus-visible:ring-[var(--primary-soft)] sm:min-h-9"><ArrowLeft className="size-4" aria-hidden="true" />Users</Link>
    <PageHeader title={user.displayName || user.email} description={user.displayName ? user.email : undefined} />

    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <div className="grid min-w-0 gap-6 self-start">
        <Card>
          <CardHeader><CardTitle>Account</CardTitle></CardHeader>
          <CardContent>
            <dl className="divide-y">
              <Fact label="Status">{status}</Fact>
              <Fact label="Role">{user.role === "ADMIN" ? <Badge>Admin</Badge> : "User"}</Fact>
              <Fact label="Joined">{when(user.createdAt)}</Fact>
              <Fact label="Last sign-in">{user.lastSignInAt ? when(user.lastSignInAt) : user.providers ? "Never" : "Unavailable"}</Fact>
              <Fact label="Signs in with">{user.providers ? user.providers.map((provider) => PROVIDER_LABELS[provider] ?? provider).join(", ") || "Unknown" : "Unavailable"}</Fact>
              <Fact label="Terms accepted">{user.acceptedVersion ? <>{user.acceptedVersion}{user.acceptedVersion !== user.currentVersion && <span className="ml-1.5 text-xs text-[var(--warning)]">(not current)</span>}</> : "Not yet"}</Fact>
              <Fact label="Google Calendar">{user.google === "active" ? "Connected" : user.google === "needs_reconnect" ? <span className="text-[var(--warning)]">Needs reconnecting</span> : "Not connected"}</Fact>
              {user.disabledAt && <Fact label="Disabled since">{when(user.disabledAt)}</Fact>}
              {user.deletionPendingAt && <Fact label="Deletion requested">{when(user.deletionPendingAt)}</Fact>}
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>What the account holds</CardTitle></CardHeader>
          <CardContent className="grid gap-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Count label="Jobs" value={user.counts.jobs} />
              <Count label="Shifts" value={user.counts.shifts} />
              <Count label="Week notes" value={user.counts.weekNotes} />
              <Count label="Game rooms" value={user.counts.rooms} />
            </div>
            <p className="text-xs leading-5 text-[var(--muted-foreground)]">Counts only. What the jobs, shifts and notes say stays with the account holder.</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid min-w-0 gap-6 self-start">
        <Card>
          <CardHeader><CardTitle>Actions</CardTitle></CardHeader>
          <CardContent>
            {user.deletionPendingAt
              ? <p className="text-sm leading-6 text-[var(--muted-foreground)]">This account is being deleted and is locked until that finishes. Don&apos;t unlock it. If it is stuck, finish the deletion below.</p>
              : <AccountActions userId={user.id} email={user.email} disabled={Boolean(user.disabledAt)} isSelf={isSelf} canResetPassword={user.providers === null || user.providers.includes("email")} />}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Support notes</CardTitle></CardHeader>
          <CardContent><SupportNotes userId={user.id} notes={notes.map((note) => ({ id: note.id, body: note.body, author: note.author, createdAt: when(note.createdAt) }))} /></CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Admin activity on this account</CardTitle></CardHeader>
          <CardContent><AuditList rows={audit} timeZone={timeZone} empty="No admin actions on this account in the last 30 days." /></CardContent>
        </Card>

        {/* Not for yourself (Account and privacy is where you delete your own)
            and not for another admin, whose access comes from the allowlist. */}
        {!isSelf && user.role !== "ADMIN" && <Card className="border-[color-mix(in_srgb,var(--danger)_35%,var(--border))]">
          <CardHeader><CardTitle className="text-[var(--danger)]">{user.deletionPendingAt ? "Finish deletion" : "Delete account"}</CardTitle></CardHeader>
          <CardContent><DeleteAccount userId={user.id} email={user.email} finishing={Boolean(user.deletionPendingAt)} /></CardContent>
        </Card>}
      </div>
    </div>
  </>;
}
