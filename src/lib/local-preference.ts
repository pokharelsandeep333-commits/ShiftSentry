export type LocalPreference<T> = {
  subscribe: (listener: () => void) => () => void;
  read: () => T;
  serverSnapshot: () => T;
  write: (value: T) => void;
};

function safeParse(raw: string): unknown {
  try { return JSON.parse(raw); } catch { return null; }
}

/**
 * A per-viewer setting kept in localStorage, shaped for `useSyncExternalStore`.
 *
 * Two subtleties are handled here once rather than at each call site. `read`
 * caches its parse against the raw string, because `getSnapshot` returning a
 * fresh object every call makes useSyncExternalStore re-render without end. And
 * a blocked store -- a private window, or a browser set to refuse site data --
 * falls back to the value written this session rather than to the default, so
 * the control still responds even when the choice cannot outlive the visit.
 *
 * `revive` is given whatever `JSON.parse` produced and returns null for anything
 * it does not recognise: these values survive deploys, so an entry written by an
 * older build must degrade to the default rather than reach the UI as garbage.
 */
export function createLocalPreference<T>(storageKey: string, fallback: T, revive: (parsed: unknown) => T | null): LocalPreference<T> {
  const listeners = new Set<() => void>();
  let cachedRaw: string | null = null;
  let cached = fallback;

  function read(): T {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw !== cachedRaw) {
        cachedRaw = raw;
        cached = (raw === null ? null : revive(safeParse(raw))) ?? fallback;
      }
      return cached;
    } catch {
      return cached;
    }
  }

  return {
    read,
    serverSnapshot: () => fallback,
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    write(value) {
      const raw = JSON.stringify(value);
      try { window.localStorage.setItem(storageKey, raw); } catch { /* the choice just does not outlive the visit */ }
      cachedRaw = raw;
      cached = value;
      for (const listener of listeners) listener();
    },
  };
}

/**
 * The last `limit` entries by key order, for records that would otherwise grow
 * without bound. Keys here are sortable stamps, so "newest" is simply "largest"
 * -- the entries dropped are the ones furthest in the past, which is what the
 * viewer is least likely to scroll back to.
 */
export function keepNewestKeys<T>(record: Record<string, T>, limit: number): Record<string, T> {
  const keys = Object.keys(record);
  if (keys.length <= limit) return record;
  return Object.fromEntries(keys.sort().slice(keys.length - limit).map((key) => [key, record[key]]));
}
