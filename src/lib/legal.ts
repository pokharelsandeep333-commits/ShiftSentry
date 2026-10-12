import { z } from "zod";
import { safeInternalRedirect } from "./request-origin";

/** Deliberately matches the immutable legal_versions row in the migration. */
export const LEGAL_VERSION = "2026-10-11.1";
export const MINIMUM_AGE = 16;
export const AUDIT_RETENTION_DAYS = 30;

export const legalAcceptanceSchema = z.object({
  version: z.literal(LEGAL_VERSION, "The terms changed. Reload this page before accepting."),
  agreed: z.literal("on", "Please agree to the Terms and acknowledge the Privacy Policy."),
  eligible: z.literal("on", "Please confirm the age and guardian-permission requirements."),
});

export const accountDeletionSchema = z.object({
  confirmation: z.literal("DELETE", "Type DELETE to confirm permanent account deletion."),
  understood: z.literal("on", "Please confirm that you understand what will be deleted."),
});

export function legalDestination(value: string | null) {
  const next = safeInternalRedirect(value);
  const pathname = new URL(next, "https://internal.invalid").pathname;
  return ["/accept-terms", "/login", "/auth/callback"].includes(pathname) ? "/" : next;
}

export function acceptancePath(next: string | null) {
  return `/accept-terms?next=${encodeURIComponent(legalDestination(next))}`;
}

/** Token refresh (iat) is not a fresh authentication event. Only verified AMR counts. */
export function hasRecentAuthentication(claims: { amr?: unknown }, now = Date.now()) {
  if (!Array.isArray(claims.amr)) return false;
  return claims.amr.some((entry: unknown) => {
    if (!entry || typeof entry !== "object") return false;
    const { method, timestamp } = entry as { method?: unknown; timestamp?: unknown };
    return typeof method === "string" && ["password", "oauth", "otp", "totp", "webauthn/passkey"].includes(method)
      && typeof timestamp === "number" && Number.isFinite(timestamp)
      && timestamp * 1000 <= now && now - timestamp * 1000 < 10 * 60 * 1000;
  });
}
