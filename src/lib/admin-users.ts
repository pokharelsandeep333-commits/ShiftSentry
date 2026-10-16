/**
 * The users list's filters, read from the URL. Every value is checked against
 * a fixed list, so a hand-edited query string can only ever select a known
 * filter, and the page number is clamped to something sane.
 */
export const USER_STATUSES = ["all", "active", "disabled", "pending"] as const;
export const USER_ROLES = ["all", "admin", "user"] as const;
export const USERS_PAGE_SIZE = 25;

export type UserFilters = { q: string; status: (typeof USER_STATUSES)[number]; role: (typeof USER_ROLES)[number]; page: number };

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export function readUserFilters(params: Record<string, string | string[] | undefined>): UserFilters {
  const status = first(params.status);
  const role = first(params.role);
  const page = Number.parseInt(first(params.page), 10);
  return {
    q: first(params.q).trim().slice(0, 100),
    status: (USER_STATUSES as readonly string[]).includes(status) ? status as UserFilters["status"] : "all",
    role: (USER_ROLES as readonly string[]).includes(role) ? role as UserFilters["role"] : "all",
    page: Number.isFinite(page) && page >= 1 ? Math.min(page, 10_000) : 1,
  };
}

/** The list URL with some filters changed. Defaults are left out, so the plain list is plain `/admin/users`. */
export function usersHref(filters: UserFilters, change: Partial<UserFilters>) {
  const next = { ...filters, page: 1, ...change };
  const params = new URLSearchParams();
  if (next.q) params.set("q", next.q);
  if (next.status !== "all") params.set("status", next.status);
  if (next.role !== "all") params.set("role", next.role);
  if (next.page > 1) params.set("page", String(next.page));
  const query = params.toString();
  return query ? `/admin/users?${query}` : "/admin/users";
}
