import "server-only";
import { revokeToken } from "@/lib/google/client";
import { decryptToken, parseEncryptionKey } from "@/lib/google/token-crypto";
import type { createAdminSupabaseClient } from "@/lib/supabase/server";

/**
 * Revoke a user's stored Google refresh token with Google, during account
 * deletion. Read through the admin client because the account is already
 * locked by then. Deletion treats a failure here as best effort: the stored
 * ciphertext is removed with the account either way, which /privacy promises.
 */
export async function revokeStoredCalendarToken(admin: ReturnType<typeof createAdminSupabaseClient>, userId: string) {
  const { data, error } = await admin.from("google_calendar_connections").select("refresh_token_ciphertext").eq("user_id", userId).maybeSingle();
  if (error) throw new Error("Calendar lookup failed.");
  const encryptionKey = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  if (data && encryptionKey) await revokeToken(decryptToken(data.refresh_token_ciphertext, userId, parseEncryptionKey(encryptionKey)));
}
