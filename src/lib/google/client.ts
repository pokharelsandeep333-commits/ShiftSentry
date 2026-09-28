import { mergeCalendarResults, normalizeGoogleEvent, type CalendarEvent, type GoogleEventResource } from "@/lib/calendar-clash";
import type { GoogleCalendarConfig } from "./config";
import { readIdTokenEmail } from "./oauth";

/**
 * Every call to Google, server-side only. Each has a 3 s budget; the pages that
 * use them degrade to "couldn't reach Google" rather than wait. Nothing here
 * logs a token, a code, or an event title.
 */
const TIMEOUT_MS = 3_000;
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

export class GoogleAuthError extends Error {
  /** invalid_grant: the refresh token is dead, reconnect. expired: one access token was refused; refresh and carry on. */
  constructor(public reason: "invalid_grant" | "expired" | "other") {
    super(`Google token request failed (${reason}).`);
    this.name = "GoogleAuthError";
  }
}

export function classifyTokenError(status: number, body: unknown): "invalid_grant" | "other" {
  return status === 400 && typeof body === "object" && body !== null && (body as { error?: unknown }).error === "invalid_grant" ? "invalid_grant" : "other";
}

async function tokenRequest(params: Record<string, string>) {
  const response = await fetch(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params), signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) throw new GoogleAuthError(classifyTokenError(response.status, body));
  return body as { access_token: string; expires_in: number; refresh_token?: string; scope?: string; id_token?: string };
}

function expiresAt(seconds: number) {
  return new Date(Date.now() + seconds * 1_000).toISOString();
}

export async function exchangeCode(config: GoogleCalendarConfig, { code, verifier, redirectUri }: { code: string; verifier: string; redirectUri: string }) {
  const body = await tokenRequest({ grant_type: "authorization_code", code, code_verifier: verifier, redirect_uri: redirectUri, client_id: config.clientId, client_secret: config.clientSecret });
  if (!body.refresh_token) throw new GoogleAuthError("other");
  return { refreshToken: body.refresh_token, accessToken: body.access_token, expiresAt: expiresAt(body.expires_in), scope: body.scope ?? "", email: readIdTokenEmail(body.id_token) };
}

export async function refreshAccessToken(config: GoogleCalendarConfig, refreshToken: string) {
  const body = await tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: config.clientId, client_secret: config.clientSecret });
  return { accessToken: body.access_token, expiresAt: expiresAt(body.expires_in), refreshToken: body.refresh_token ?? null };
}

export async function revokeToken(token: string) {
  try {
    const response = await fetch("https://oauth2.googleapis.com/revoke", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token }), signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
    if (!response.ok) console.error("Google token revoke returned", response.status);
  } catch (error) {
    console.error("Google token revoke failed:", error instanceof Error ? error.name : "unknown");
  }
}

async function calendarGet<T>(accessToken: string, path: string, params: Record<string, string>) {
  const url = new URL(`${CALENDAR_API}${path}`);
  url.search = new URLSearchParams(params).toString();
  const response = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` }, signal: AbortSignal.timeout(TIMEOUT_MS), cache: "no-store" });
  // A refused access token is not a revoked grant: clock skew or an early
  // expiry does this too. The refresh that follows decides whether to reconnect.
  if (response.status === 401) throw new GoogleAuthError("expired");
  if (!response.ok) throw new Error(`Calendar API ${path.split("/")[1]} returned ${response.status}`);
  return (await response.json()) as T;
}

export type GoogleCalendarListEntry = { id: string; summary: string; color: string; primary: boolean };

export async function listCalendars(accessToken: string): Promise<GoogleCalendarListEntry[]> {
  const body = await calendarGet<{ items?: { id: string; summary?: string; summaryOverride?: string; backgroundColor?: string; primary?: boolean }[] }>(accessToken, "/users/me/calendarList", { minAccessRole: "reader", maxResults: "100", fields: "items(id,summary,summaryOverride,backgroundColor,primary)" });
  // The colour goes into inline styles, so only a plain hex value is accepted from Google.
  return (body.items ?? []).map((item) => ({ id: item.id, summary: item.summaryOverride ?? item.summary ?? item.id, color: /^#[0-9a-f]{6}$/i.test(item.backgroundColor ?? "") ? item.backgroundColor! : "#9486ff", primary: item.primary === true }));
}

export async function listEvents(accessToken: string, calendarIds: string[], range: { timeMin: string; timeMax: string }, timeZone: string, maxResults = 50): Promise<CalendarEvent[]> {
  const pages = await Promise.allSettled(calendarIds.map(async (calendarId) => {
    const body = await calendarGet<{ items?: GoogleEventResource[] }>(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events`, {
      timeMin: range.timeMin,
      timeMax: range.timeMax,
      singleEvents: "true",
      orderBy: "startTime",
      maxResults: String(maxResults),
      fields: "items(id,status,summary,transparency,start,end,attendees(self,responseStatus))",
    });
    return (body.items ?? []).map((item) => normalizeGoogleEvent(item, calendarId, timeZone)).filter((event): event is CalendarEvent => event !== null);
  }));
  return mergeCalendarResults(pages, (reason) => reason instanceof GoogleAuthError);
}

/** Calendar id → colour, with Google's "primary" alias pointing at the primary calendar's colour. */
export function calendarColorMap(calendars: GoogleCalendarListEntry[]) {
  const colors = new Map(calendars.map((calendar) => [calendar.id, calendar.color]));
  const primary = calendars.find((calendar) => calendar.primary);
  if (primary) colors.set("primary", primary.color);
  return colors;
}

/**
 * Events for a sync run: every page (at most 10 of 250 per calendar), and which
 * calendars failed. The sync deletes shifts whose events are gone, so a
 * calendar that failed or was cut short must be reported rather than silently
 * returning fewer events. An auth failure still fails the whole call.
 */
export async function listEventsForSync(accessToken: string, calendarIds: string[], range: { timeMin: string; timeMax: string }, timeZone: string): Promise<{ events: CalendarEvent[]; failedCalendarIds: string[] }> {
  const results = await Promise.allSettled(calendarIds.map(async (calendarId) => {
    const events: CalendarEvent[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < 10; page += 1) {
      const body = await calendarGet<{ items?: GoogleEventResource[]; nextPageToken?: string }>(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events`, {
        timeMin: range.timeMin,
        timeMax: range.timeMax,
        singleEvents: "true",
        orderBy: "startTime",
        maxResults: "250",
        fields: "items(id,status,summary,transparency,start,end,attendees(self,responseStatus)),nextPageToken",
        ...(pageToken ? { pageToken } : {}),
      });
      for (const item of body.items ?? []) {
        const event = normalizeGoogleEvent(item, calendarId, timeZone);
        if (event) events.push(event);
      }
      if (!body.nextPageToken) return events;
      pageToken = body.nextPageToken;
    }
    throw new Error("Calendar has more events than one sync reads");
  }));

  const auth = results.find((result): result is PromiseRejectedResult => result.status === "rejected" && result.reason instanceof GoogleAuthError);
  if (auth) throw auth.reason;
  const failedCalendarIds = calendarIds.filter((_, index) => results[index].status === "rejected");
  const seen = new Set<string>();
  const events = results
    .flatMap((result) => (result.status === "fulfilled" ? result.value : []))
    .filter((event) => (seen.has(event.id) ? false : (seen.add(event.id), true)));
  return { events, failedCalendarIds };
}
