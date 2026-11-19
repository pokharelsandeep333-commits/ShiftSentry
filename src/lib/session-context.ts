/**
 * The proxy's answer to "who is this, and may they use the workspace?",
 * handed to the page so it does not ask the database again.
 *
 * `src/proxy.ts` calls `get_session_context()` once (the caller's own profile
 * and whether they hold the current agreement) and, only when the agreement
 * holds, sets SESSION_HEADER on the forwarded request. `getSignedInProfile()`
 * uses it in place of its profile read, and `requireUser()` in place of its
 * agreement check, but only after verifying the JWT itself and only when the
 * profile id equals that JWT's `sub`.
 *
 * Trust: the proxy deletes any client-sent copy before anything else, so the
 * header can only come from the proxy (`src/proxy.test.ts`). It is a request
 * header between the proxy and the page; it never goes back to the browser.
 * The database still enforces the agreement on every write.
 */
export const SESSION_HEADER = "x-shiftsentry-session";

export type SessionProfile = {
  id: string;
  email: string;
  display_name: string | null;
  role: "USER" | "ADMIN";
  time_zone: string;
  week_starts_on: number;
  global_weekly_limit_minutes: number | null;
  disabled_at: string | null;
  deletion_pending_at: string | null;
};

/** Header values must be ASCII; names and emails may not be. */
export function encodeSessionProfile(profile: SessionProfile) {
  return encodeURIComponent(JSON.stringify(profile));
}

const nullableString = (value: unknown): value is string | null => value === null || typeof value === "string";

/** The profile in `value`, or null unless it is well-formed and belongs to `userId`. */
export function decodeSessionProfile(value: string | null | undefined, userId: string): SessionProfile | null {
  if (!value || !userId) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(decodeURIComponent(value));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const p = parsed as Record<string, unknown>;
  if (p.id !== userId || typeof p.email !== "string" || (p.role !== "USER" && p.role !== "ADMIN")) return null;
  if (typeof p.time_zone !== "string" || typeof p.week_starts_on !== "number") return null;
  if (!nullableString(p.display_name) || !nullableString(p.disabled_at) || !nullableString(p.deletion_pending_at)) return null;
  if (p.global_weekly_limit_minutes !== null && typeof p.global_weekly_limit_minutes !== "number") return null;
  return {
    id: p.id, email: p.email, display_name: p.display_name, role: p.role, time_zone: p.time_zone, week_starts_on: p.week_starts_on,
    global_weekly_limit_minutes: p.global_weekly_limit_minutes as number | null, disabled_at: p.disabled_at, deletion_pending_at: p.deletion_pending_at,
  };
}
