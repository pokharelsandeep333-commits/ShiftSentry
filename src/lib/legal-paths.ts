import { safeInternalRedirect } from "./request-origin";

/**
 * Where the agreement gate sends people, kept apart from `legal.ts` because
 * that file holds the Zod schemas. The sign-in form needs `acceptancePath`,
 * and importing it from `legal.ts` put Zod (about 100 KB) into /login's
 * bundle, which the landing prefetches. `legal.ts` re-exports both, so server
 * code keeps importing them from there.
 */
export function legalDestination(value: string | null) {
  const next = safeInternalRedirect(value);
  const pathname = new URL(next, "https://internal.invalid").pathname;
  return ["/accept-terms", "/login", "/auth/callback"].includes(pathname) ? "/" : next;
}

export function acceptancePath(next: string | null) {
  return `/accept-terms?next=${encodeURIComponent(legalDestination(next))}`;
}
