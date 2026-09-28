import { parseEncryptionKey } from "./token-crypto";

/**
 * The Google Calendar feature is dark unless GOOGLE_CALENDAR_ENABLED is exactly
 * "true" and every credential is present. It ships to production switched off
 * and is turned on only after Google approves the calendar scopes. A bad key
 * turns the feature off (logged once) rather than breaking the pages that ask.
 */
export type GoogleCalendarConfig = { clientId: string; clientSecret: string; encryptionKey: Buffer };

let warned = false;

export function readGoogleCalendarConfig(env: Record<string, string | undefined> = process.env): GoogleCalendarConfig | null {
  if (env.GOOGLE_CALENDAR_ENABLED !== "true") return null;
  const clientId = env.GOOGLE_OAUTH_CLIENT_ID?.trim();
  const clientSecret = env.GOOGLE_OAUTH_CLIENT_SECRET?.trim();
  const rawKey = env.GOOGLE_TOKEN_ENCRYPTION_KEY?.trim();
  if (!clientId || !clientSecret || !rawKey) return null;
  try {
    return { clientId, clientSecret, encryptionKey: parseEncryptionKey(rawKey) };
  } catch {
    if (!warned) { console.error("GOOGLE_TOKEN_ENCRYPTION_KEY is not 32 base64 bytes; Google Calendar is disabled."); warned = true; }
    return null;
  }
}

export function isGoogleCalendarEnabled() {
  return readGoogleCalendarConfig() !== null;
}
