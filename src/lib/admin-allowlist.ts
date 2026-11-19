/**
 * `ADMIN_EMAIL_ALLOWLIST` is the only source of the ADMIN role, and it is the
 * source in both directions: an allowlisted email is promoted on sign-in, and
 * an ADMIN whose email has left the list is demoted (`getSignedInProfile`, and
 * `reconcileAdminRoles` at server start). Before the 2026-11-18 security scan
 * only the promotion existed, so removing an email from the list left that
 * account an admin in the app and in the audit-log RLS, which reads the stored
 * role. An empty or missing list means nobody is an admin.
 */
export function parseAdminAllowlist(raw: string | undefined) {
  return new Set((raw ?? "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean));
}

export function isAllowlisted(email: string | null | undefined, allowlist: ReadonlySet<string>) {
  return Boolean(email) && allowlist.has(email!.trim().toLowerCase());
}

/** The ADMIN rows whose email is no longer on the list. */
export function adminsToRevoke<T extends { email: string | null }>(admins: readonly T[], allowlist: ReadonlySet<string>) {
  return admins.filter((admin) => !isAllowlisted(admin.email, allowlist));
}
