/**
 * Sliding-window limiter held in process memory. Enough for this deployment --
 * one app container behind Nginx -- and for keys that are user ids. A second
 * container would each allow the full limit; move this to Postgres then.
 */
export function createRateLimiter({ limit, windowMs }: { limit: number; windowMs: number }) {
  const hits = new Map<string, number[]>();
  return function allow(key: string, now = Date.now()) {
    const recent = (hits.get(key) ?? []).filter((at) => at > now - windowMs);
    if (recent.length >= limit) { hits.set(key, recent); return false; }
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 10_000) for (const [stale, times] of hits) if (times.every((at) => at <= now - windowMs)) hits.delete(stale);
    return true;
  };
}
