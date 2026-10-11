/** Admission spacing and per-request timeouts do not bound one sync's work. */
export const SYNC_LIMITS = {
  calendars: 25,
  concurrency: 4,
  requests: 50,
  events: 2_500,
  writes: 200,
  durationMs: 15_000,
} as const;

export class SyncBudgetExceeded extends Error {
  constructor() {
    super("Google sync work limit reached.");
    this.name = "SyncBudgetExceeded";
  }
}

/** Shared by calendar pagination, missing-event checks and plan application. */
export class SyncBudget {
  private readonly deadline: number;
  private requests = 0;
  private events = 0;
  private exhausted = false;

  constructor(private readonly clock: () => number = Date.now) {
    this.deadline = clock() + SYNC_LIMITS.durationMs;
  }

  private refuse(): never {
    this.exhausted = true;
    throw new SyncBudgetExceeded();
  }

  check() {
    if (this.exhausted || this.clock() >= this.deadline) this.refuse();
  }

  calendarIds(ids: readonly string[]) {
    this.check();
    const unique = [...new Set(ids)];
    if (unique.length > SYNC_LIMITS.calendars) this.refuse();
    return unique;
  }

  requestSignal() {
    this.check();
    if (this.requests >= SYNC_LIMITS.requests) this.refuse();
    this.requests += 1;
    return this.operationSignal();
  }

  operationSignal() {
    this.check();
    return AbortSignal.timeout(Math.max(1, Math.min(3_000, this.deadline - this.clock())));
  }

  recordEvents(count: number) {
    this.check();
    this.events += count;
    if (this.events > SYNC_LIMITS.events) this.refuse();
  }

  checkWrites(count: number) {
    this.check();
    if (count > SYNC_LIMITS.writes) this.refuse();
  }
}
