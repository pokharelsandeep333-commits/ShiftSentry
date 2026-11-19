import { createRateLimiter } from "@/lib/rate-limit";

/**
 * The read budget for every trip to Google (2026-11-18 security scan). The
 * sync had its own budget and admission claim, but the Calendar page, the
 * dashboard glance and the clash check read Google live on every render, once
 * per stored calendar id, duplicates included, so one connected account could
 * spend the app's shared Google quota by reloading.
 *
 * - Calendar ids are de-duplicated and capped at the column's own 25 before a
 *   single request goes out.
 * - At most `GOOGLE_READ_CONCURRENCY` calendar reads run at once per call.
 * - `withCalendarAccess` admits at most `perUser` calls per user per minute and
 *   `global` per minute across the app; past either it answers `unavailable`,
 *   which every surface already draws, rather than queueing.
 *
 * In process memory, like `createRateLimiter`: right for one app container.
 */
export const GOOGLE_READ_LIMITS = { calendars: 25, concurrency: 4, perUser: 30, global: 600, windowMs: 60_000 } as const;

export function readableCalendarIds(ids: readonly string[]) {
  return [...new Set(ids.filter((id) => typeof id === "string" && id.length > 0))].slice(0, GOOGLE_READ_LIMITS.calendars);
}

export function createGoogleReadBudget(limits: { perUser: number; global: number; windowMs: number } = GOOGLE_READ_LIMITS) {
  const perUser = createRateLimiter({ limit: limits.perUser, windowMs: limits.windowMs });
  const global = createRateLimiter({ limit: limits.global, windowMs: limits.windowMs });
  // The user's own allowance first, so someone over theirs does not also use
  // up a slot of the shared one.
  return (userId: string, now = Date.now()) => perUser(userId, now) && global("all", now);
}

/** `Promise.allSettled` over `items`, with no more than `limit` in flight. */
export async function settleWithConcurrency<T, R>(items: readonly T[], limit: number, run: (item: T) => Promise<R>): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const index = next++;
      try {
        results[index] = { status: "fulfilled", value: await run(items[index]) };
      } catch (reason) {
        results[index] = { status: "rejected", reason };
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, worker));
  return results;
}
