import Link from "next/link";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { USERS_PAGE_SIZE, usersHref, type UserFilters } from "@/lib/admin-users";
import { cn } from "@/lib/utils";

export type UserListRow = { id: string; email: string; displayName: string | null; role: "USER" | "ADMIN"; disabledAt: Date | null; deletionPendingAt: Date | null; createdAt: Date };

const STATUS_LABELS: Record<UserFilters["status"], string> = { all: "All", active: "Active", disabled: "Disabled", pending: "Deletion pending" };
const ROLE_LABELS: Record<UserFilters["role"], string> = { all: "Any role", admin: "Admins", user: "Users" };

function Chip({ href, active, children }: { href: string; active: boolean; children: React.ReactNode }) {
  return <Link href={href} aria-current={active ? "true" : undefined} className={cn("press flex min-h-9 items-center whitespace-nowrap rounded-full border px-3 text-xs font-semibold outline-none focus-visible:ring-4 focus-visible:ring-[var(--primary-soft)]", active ? "border-[color-mix(in_srgb,var(--primary)_35%,var(--border))] bg-[var(--primary-soft)] text-[var(--primary)]" : "text-[var(--muted-foreground)] hover:bg-[var(--surface-subtle)] hover:text-[var(--foreground)]")}>{children}</Link>;
}

/** The users list: search, status and role filters, and pages of 25. `/admin/users` loads the rows. */
export function UsersView({ users, total, filters }: { users: UserListRow[]; total: number; filters: UserFilters }) {
  const pages = Math.max(1, Math.ceil(total / USERS_PAGE_SIZE));
  const from = total ? (filters.page - 1) * USERS_PAGE_SIZE + 1 : 0;
  const to = Math.min(total, filters.page * USERS_PAGE_SIZE);

  return <>
    <PageHeader title="Users" description="Find an account to see its status and act on it. Account pages show counts, not anyone's shifts." />

    <Card className="mb-4">
      <CardContent className="grid gap-3 pt-5 sm:pt-6">
        {/* A plain GET form: the filters live in the URL, so a filtered list can be bookmarked or shared between admins. */}
        <form action="/admin/users" className="flex gap-2">
          {filters.status !== "all" && <input type="hidden" name="status" value={filters.status} />}
          {filters.role !== "all" && <input type="hidden" name="role" value={filters.role} />}
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search by email or name</span>
            <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-[var(--muted-foreground)]" aria-hidden="true" />
            <input name="q" type="search" defaultValue={filters.q} maxLength={100} placeholder="Search by email or name" className="field-control pl-10" />
          </label>
          <button type="submit" className="press h-11 shrink-0 rounded-xl border px-4 text-sm font-semibold hover:bg-[var(--surface-subtle)]">Search</button>
        </form>
        <div className="flex flex-wrap items-center gap-2">
          {(Object.keys(STATUS_LABELS) as UserFilters["status"][]).map((status) => <Chip key={status} href={usersHref(filters, { status })} active={filters.status === status}>{STATUS_LABELS[status]}</Chip>)}
          <span className="mx-1 h-5 w-px bg-[var(--border)]" aria-hidden="true" />
          {(Object.keys(ROLE_LABELS) as UserFilters["role"][]).map((role) => <Chip key={role} href={usersHref(filters, { role })} active={filters.role === role}>{ROLE_LABELS[role]}</Chip>)}
        </div>
      </CardContent>
    </Card>

    <Card>
      <CardContent className="p-2 sm:p-3">
        {/* `min-w-0` on the rows: a grid item will not shrink below its content, so a
            long email pushed the whole page sideways on a phone instead of truncating. */}
        {users.length ? <ul className="grid gap-1">
          {users.map((user) => <li key={user.id} className="min-w-0">
            <Link href={`/admin/users/${user.id}`} className="press flex min-w-0 items-center gap-3 rounded-2xl p-3 outline-none hover:bg-[var(--surface-subtle)] focus-visible:ring-4 focus-visible:ring-[var(--primary-soft)]">
              <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--primary-soft)] font-display font-semibold text-[var(--primary)]">{(user.displayName?.trim() || user.email).charAt(0).toUpperCase()}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-semibold">{user.displayName || user.email}</span>
                <span className="block truncate text-sm text-[var(--muted-foreground)]">{user.email}</span>
              </span>
              <span className="hidden shrink-0 text-xs text-[var(--muted-foreground)] sm:block">Joined {user.createdAt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
              <span className="flex shrink-0 flex-wrap justify-end gap-1">
                {user.role === "ADMIN" && <Badge>Admin</Badge>}
                {user.deletionPendingAt ? <Badge variant="warning">Deletion pending</Badge> : user.disabledAt ? <Badge variant="danger">Disabled</Badge> : null}
              </span>
              <ChevronRight className="size-4 shrink-0 text-[var(--muted-foreground)]" aria-hidden="true" />
            </Link>
          </li>)}
        </ul> : <p className="p-10 text-center text-sm text-[var(--muted-foreground)]">No accounts match.</p>}
      </CardContent>
    </Card>

    <nav aria-label="Pages" className="mt-4 flex items-center justify-between gap-3 text-sm text-[var(--muted-foreground)]">
      <span>{total ? `${from}–${to} of ${total}` : "0 accounts"}</span>
      <span className="flex gap-2">
        {filters.page > 1 ? <Link href={usersHref(filters, { page: filters.page - 1 })} className="press flex h-9 items-center gap-1 rounded-xl border px-3 font-semibold hover:bg-[var(--surface-subtle)]"><ChevronLeft className="size-4" aria-hidden="true" />Previous</Link> : null}
        {filters.page < pages ? <Link href={usersHref(filters, { page: filters.page + 1 })} className="press flex h-9 items-center gap-1 rounded-xl border px-3 font-semibold hover:bg-[var(--surface-subtle)]">Next<ChevronRight className="size-4" aria-hidden="true" /></Link> : null}
      </span>
    </nav>
  </>;
}
