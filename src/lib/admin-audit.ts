/**
 * How audit events read in the admin area and in its CSV download. The action
 * codes are the stored values (`audit_events.action`); everything here is
 * presentation, so an unknown code from an older or newer build still shows,
 * as itself.
 */
export const AUDIT_ACTIONS: Record<string, { label: string; verb: string }> = {
  "account.disabled": { label: "Account disabled", verb: "disabled" },
  "account.enabled": { label: "Account enabled", verb: "enabled" },
  "account.password_reset_requested": { label: "Password reset sent", verb: "sent a password reset to" },
  "account.sessions_revoked": { label: "Signed out everywhere", verb: "signed out every session of" },
  "account.note_added": { label: "Support note added", verb: "added a support note to" },
  "account.note_deleted": { label: "Support note deleted", verb: "deleted a support note on" },
  "account.deleted_by_admin": { label: "Account deleted", verb: "deleted" },
  "game.room_ended": { label: "Game room ended", verb: "ended a game room" },
  "game.player_removed": { label: "Player removed from game", verb: "removed from a game:" },
  "game.name_reset": { label: "Game name reset", verb: "reset the game name of" },
  "announcement.posted": { label: "Announcement posted", verb: "posted a site announcement" },
  "announcement.cleared": { label: "Announcement cleared", verb: "cleared the site announcement" },
  "audit.exported": { label: "Audit log downloaded", verb: "downloaded the audit log" },
};

/** Days the retention job keeps audit rows (`AUDIT_RETENTION_DAYS`); the log can show no further back. */
export const AUDIT_WINDOW_DAYS = 30 as const;

export function auditActionLabel(action: string) {
  return AUDIT_ACTIONS[action]?.label ?? action;
}

/**
 * One sentence for an event: "ava@x disabled sam@y". `target` is null when
 * the event has no target, and "a deleted account" when it had one that is
 * gone: deletion clears the profile, and the retention job the rest.
 */
export function describeAuditEvent(action: string, actor: string | null, target: string | null) {
  const who = actor ?? "System";
  const known = AUDIT_ACTIONS[action];
  if (!known) return `${who}: ${action}${target ? ` (${target})` : ""}`;
  return target ? `${who} ${known.verb} ${target}` : `${who} ${known.verb}`;
}

/**
 * A CSV cell. Quoted always, quotes doubled, and a leading = + - @ (or a tab
 * or carriage return) defused with an apostrophe: spreadsheet apps execute a
 * cell that starts with one as a formula, and an email or a display name is
 * user-controlled text.
 */
export function csvCell(value: string | number | null | undefined) {
  const text = value === null || value === undefined ? "" : String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function csvRow(values: (string | number | null | undefined)[]) {
  return values.map(csvCell).join(",");
}

export const AUDIT_PAGE_SIZE = 50;
export const AUDIT_DAY_OPTIONS = [1, 7, 30] as const;

export type AuditFilters = { action: string; actor: string; target: string; days: (typeof AUDIT_DAY_OPTIONS)[number]; page: number };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function firstValue(value: FormDataEntryValue | string | string[] | null | undefined) {
  if (Array.isArray(value)) return value[0] ?? "";
  return typeof value === "string" ? value : "";
}

/**
 * The audit log's filters, from the URL or from the download form's fields.
 * `action` must be a known code, `actor` a uuid, `days` one of the offered
 * windows (never past the 30 days kept); anything else means "no filter".
 */
export function readAuditFilters(get: (name: string) => FormDataEntryValue | string | string[] | null | undefined): AuditFilters {
  const action = firstValue(get("action"));
  const actor = firstValue(get("actor"));
  const days = Number(firstValue(get("days")));
  const page = Number.parseInt(firstValue(get("page")), 10);
  return {
    // hasOwn, not `in`: `"toString" in AUDIT_ACTIONS` is true through the prototype.
    action: Object.hasOwn(AUDIT_ACTIONS, action) ? action : "",
    actor: UUID.test(actor) ? actor.toLowerCase() : "",
    target: firstValue(get("target")).trim().slice(0, 100),
    days: (AUDIT_DAY_OPTIONS as readonly number[]).includes(days) ? days as AuditFilters["days"] : AUDIT_WINDOW_DAYS,
    page: Number.isFinite(page) && page >= 1 ? Math.min(page, 10_000) : 1,
  };
}

/** The log URL with some filters changed; defaults are left out. A filter change goes back to page 1. */
export function auditHref(filters: AuditFilters, change: Partial<AuditFilters>) {
  const next = { ...filters, page: 1, ...change };
  const params = new URLSearchParams();
  if (next.action) params.set("action", next.action);
  if (next.actor) params.set("actor", next.actor);
  if (next.target) params.set("target", next.target);
  if (next.days !== AUDIT_WINDOW_DAYS) params.set("days", String(next.days));
  if (next.page > 1) params.set("page", String(next.page));
  const query = params.toString();
  return query ? `/admin/audit?${query}` : "/admin/audit";
}
