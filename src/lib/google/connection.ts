import { createServerSupabaseClient } from "@/lib/supabase/server";
import { readGoogleCalendarConfig, type GoogleCalendarConfig } from "./config";
import { GoogleAuthError, refreshAccessToken, revokeToken, type exchangeCode } from "./client";
import { TokenDecryptError, decryptToken, encryptToken } from "./token-crypto";

/**
 * The one row per user, read and written through the RLS client as that user.
 * `withCalendarAccess` is the only way callers reach Google: it resolves the
 * flag, the row, a fresh access token and the failure states in one place, so
 * every surface shows the same four outcomes.
 */
export type ConnectionSummary = { googleEmail: string; selectedCalendarIds: string[]; status: "active" | "needs_reconnect" };
export type CalendarAccess<T> = { status: "ok"; value: T } | { status: "disabled" | "not_connected" | "needs_reconnect" | "unavailable" };

const COLUMNS = "user_id,google_email,refresh_token_ciphertext,access_token_ciphertext,access_token_expires_at,selected_calendar_ids,status";

export async function getConnectionSummary(userId: string): Promise<ConnectionSummary | null> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.from("google_calendar_connections").select("google_email,selected_calendar_ids,status").eq("user_id", userId).maybeSingle();
  return data ? { googleEmail: data.google_email, selectedCalendarIds: data.selected_calendar_ids, status: data.status === "needs_reconnect" ? "needs_reconnect" : "active" } : null;
}

export async function saveNewConnection(config: GoogleCalendarConfig, userId: string, tokens: Awaited<ReturnType<typeof exchangeCode>>) {
  const supabase = await createServerSupabaseClient();
  const { data: previous } = await supabase.from("google_calendar_connections").select("google_email,selected_calendar_ids").eq("user_id", userId).maybeSingle();
  const googleEmail = tokens.email ?? "Google account";
  // A reconnect to the same account keeps the calendars already chosen; another
  // account's calendar ids would only 404, so a different account starts over.
  const keepSelection = previous && previous.google_email.toLowerCase() === googleEmail.toLowerCase();
  const { error } = await supabase.from("google_calendar_connections").upsert({
    user_id: userId,
    google_email: googleEmail,
    refresh_token_ciphertext: encryptToken(tokens.refreshToken, userId, config.encryptionKey),
    access_token_ciphertext: encryptToken(tokens.accessToken, userId, config.encryptionKey),
    access_token_expires_at: tokens.expiresAt,
    scopes: tokens.scope.split(/\s+/).filter(Boolean),
    selected_calendar_ids: keepSelection ? previous.selected_calendar_ids : ["primary"],
    status: "active",
  });
  if (error) throw new Error("Could not save the Google connection.");
}

async function markNeedsReconnect(userId: string) {
  const supabase = await createServerSupabaseClient();
  await supabase.from("google_calendar_connections").update({ status: "needs_reconnect", access_token_ciphertext: null, access_token_expires_at: null }).eq("user_id", userId);
}

export async function withCalendarAccess<T>(userId: string, run: (accessToken: string, selectedCalendarIds: string[]) => Promise<T>): Promise<CalendarAccess<T>> {
  const config = readGoogleCalendarConfig();
  if (!config) return { status: "disabled" };
  const supabase = await createServerSupabaseClient();
  const { data: row } = await supabase.from("google_calendar_connections").select(COLUMNS).eq("user_id", userId).maybeSingle();
  if (!row) return { status: "not_connected" };
  if (row.status === "needs_reconnect") return { status: "needs_reconnect" };

  try {
    let accessToken: string;
    const fresh = row.access_token_ciphertext && row.access_token_expires_at && Date.parse(row.access_token_expires_at) - Date.now() > 60_000;
    if (fresh) {
      accessToken = decryptToken(row.access_token_ciphertext!, userId, config.encryptionKey);
    } else {
      const refreshed = await refreshAccessToken(config, decryptToken(row.refresh_token_ciphertext, userId, config.encryptionKey));
      accessToken = refreshed.accessToken;
      await supabase.from("google_calendar_connections").update({
        access_token_ciphertext: encryptToken(refreshed.accessToken, userId, config.encryptionKey),
        access_token_expires_at: refreshed.expiresAt,
        ...(refreshed.refreshToken ? { refresh_token_ciphertext: encryptToken(refreshed.refreshToken, userId, config.encryptionKey) } : {}),
      }).eq("user_id", userId);
    }
    return { status: "ok", value: await run(accessToken, row.selected_calendar_ids) };
  } catch (error) {
    if (error instanceof GoogleAuthError && error.reason === "invalid_grant") {
      await markNeedsReconnect(userId);
      return { status: "needs_reconnect" };
    }
    // Not the user's problem: a wrong or rotated GOOGLE_TOKEN_ENCRYPTION_KEY
    // fails every row at once. Flipping them all to needs_reconnect would make
    // every user reconnect by hand even after the key is restored.
    if (error instanceof TokenDecryptError) {
      console.error("Stored Google token did not decrypt; check GOOGLE_TOKEN_ENCRYPTION_KEY.");
      return { status: "unavailable" };
    }
    if (error instanceof GoogleAuthError && error.reason === "expired") {
      // Drop the cached access token so the next request refreshes; only an
      // invalid_grant from that refresh means the user has to reconnect.
      await supabase.from("google_calendar_connections").update({ access_token_ciphertext: null, access_token_expires_at: null }).eq("user_id", userId);
      return { status: "unavailable" };
    }
    // The name only: a message can quote a response body, and a Calendar
    // response body is event data, which is never logged.
    console.error("Google Calendar request failed:", error instanceof Error ? error.name : "unknown");
    return { status: "unavailable" };
  }
}

export async function deleteConnection(userId: string) {
  const config = readGoogleCalendarConfig();
  const supabase = await createServerSupabaseClient();
  const { data: row } = await supabase.from("google_calendar_connections").select("refresh_token_ciphertext").eq("user_id", userId).maybeSingle();
  if (row && config) {
    try { await revokeToken(decryptToken(row.refresh_token_ciphertext, userId, config.encryptionKey)); } catch { /* undecryptable: nothing to revoke */ }
  }
  const { data: deleted, error } = await supabase.from("google_calendar_connections").delete().eq("user_id", userId).select("user_id");
  // RLS that filters out every row reports no error, so a delete that removed
  // nothing has to be caught here or Disconnect would claim success.
  if (error || (row && !deleted?.length)) throw new Error("Could not remove the Google connection.");
}
