import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Pure pieces of the Google OAuth flow: PKCE, the authorization URL, the
 * short-lived cookie that carries `state` and the verifier across the round
 * trip, and checks on what came back. The network calls live in client.ts.
 */
export const REQUIRED_CALENDAR_SCOPES = [
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
  "https://www.googleapis.com/auth/calendar.events.readonly",
] as const;
export const GOOGLE_SCOPES = ["openid", "email", ...REQUIRED_CALENDAR_SCOPES] as const;
export const OAUTH_COOKIE = "shiftsentry-google-oauth";
export const OAUTH_COOKIE_PATH = "/integrations/google";

export function createPkcePair() {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

export function createState() {
  return randomBytes(32).toString("base64url");
}

export function googleRedirectUri(origin: string) {
  return `${origin}/integrations/google/callback`;
}

export function buildAuthorizationUrl({ clientId, redirectUri, state, challenge }: { clientId: string; redirectUri: string; state: string; challenge: string }) {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: GOOGLE_SCOPES.join(" "),
    access_type: "offline",
    // Always show consent, so Google always returns a refresh token -- it omits
    // one on a repeat grant otherwise, and a reconnect would then store nothing.
    prompt: "consent",
    include_granted_scopes: "false",
    state,
    code_challenge: challenge,
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}

export function hasRequiredScopes(granted: string | undefined) {
  const scopes = new Set((granted ?? "").split(/\s+/).filter(Boolean));
  return REQUIRED_CALENDAR_SCOPES.every((scope) => scopes.has(scope));
}

/**
 * The ID token came straight from Google's token endpoint over TLS in a
 * server-to-server call, which Google's OpenID docs accept in place of verifying
 * its signature. It is used only for the address shown in Settings.
 */
export function readIdTokenEmail(idToken: string | undefined): string | null {
  const payload = idToken?.split(".")[1];
  if (!payload) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { email?: unknown };
    return typeof claims.email === "string" && claims.email.includes("@") ? claims.email : null;
  } catch {
    return null;
  }
}

type OAuthCookie = { state: string; verifier: string; userId: string };

export function encodeOAuthCookie(value: OAuthCookie) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

export function decodeOAuthCookie(raw: string | undefined): OAuthCookie | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(Buffer.from(raw, "base64url").toString("utf8")) as Partial<OAuthCookie>;
    return typeof value.state === "string" && typeof value.verifier === "string" && typeof value.userId === "string" ? { state: value.state, verifier: value.verifier, userId: value.userId } : null;
  } catch {
    return null;
  }
}

export function statesMatch(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}
