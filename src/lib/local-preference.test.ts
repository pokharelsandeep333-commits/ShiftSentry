import assert from "node:assert/strict";
import test, { afterEach } from "node:test";
import { createLocalPreference, keepNewestKeys } from "./local-preference";

type Store = { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void };

function useStore(store: Store | null) {
  (globalThis as { window?: unknown }).window = store ? { localStorage: store } : undefined;
}

function memoryStore(seed: Record<string, string> = {}) {
  const data = new Map(Object.entries(seed));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => { data.set(key, value); },
  };
}

/** Refuses every operation, as a private window or a blocked-cookies browser does. */
function blockedStore() {
  return {
    getItem: () => { throw new Error("blocked"); },
    setItem: () => { throw new Error("blocked"); },
  };
}

const reviveCount = (parsed: unknown) => typeof parsed === "number" ? parsed : null;

afterEach(() => useStore(null));

test("falls back to the default when nothing is stored", () => {
  useStore(memoryStore());
  const preference = createLocalPreference("k", 7, reviveCount);

  assert.equal(preference.read(), 7);
  assert.equal(preference.serverSnapshot(), 7);
});

test("reads a stored value and writes through to the store", () => {
  const store = memoryStore({ k: "3" });
  useStore(store);
  const preference = createLocalPreference("k", 7, reviveCount);

  assert.equal(preference.read(), 3);
  preference.write(9);
  assert.equal(store.data.get("k"), "9");
  assert.equal(preference.read(), 9);
});

test("returns the identical reference until the stored string changes", () => {
  const store = memoryStore({ k: JSON.stringify({ a: 1 }) });
  useStore(store);
  const preference = createLocalPreference<{ a: number }>("k", { a: 0 }, (parsed) => parsed as { a: number });

  // getSnapshot handing back a fresh object each call would spin
  // useSyncExternalStore forever, so this is the property that matters most.
  assert.equal(preference.read(), preference.read());
  store.setItem("k", JSON.stringify({ a: 2 }));
  assert.deepEqual(preference.read(), { a: 2 });
});

test("degrades to the default on unparseable or unrecognised entries", () => {
  useStore(memoryStore({ k: "{not json" }));
  assert.equal(createLocalPreference("k", 7, reviveCount).read(), 7);

  useStore(memoryStore({ k: JSON.stringify("a string from an older build") }));
  assert.equal(createLocalPreference("k", 7, reviveCount).read(), 7);
});

test("a blocked store still reports the choice made this session", () => {
  useStore(blockedStore());
  const preference = createLocalPreference("k", 7, reviveCount);

  assert.equal(preference.read(), 7);
  preference.write(9);
  assert.equal(preference.read(), 9);
});

test("notifies subscribers on write and stops after unsubscribe", () => {
  useStore(memoryStore());
  const preference = createLocalPreference("k", 7, reviveCount);
  let calls = 0;
  const unsubscribe = preference.subscribe(() => { calls += 1; });

  preference.write(1);
  preference.write(2);
  assert.equal(calls, 2);
  unsubscribe();
  preference.write(3);
  assert.equal(calls, 2);
});

test("keepNewestKeys drops the lowest keys once past the limit", () => {
  const record = { "2026-01": true, "2026-03": false, "2026-02": true, "2026-04": true };

  assert.deepEqual(keepNewestKeys(record, 10), record);
  assert.deepEqual(keepNewestKeys(record, 2), { "2026-03": false, "2026-04": true });
});
