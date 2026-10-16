"use server";

import { redirect } from "next/navigation";
import { requireAccount } from "@/lib/auth";
import { accountDeletionSchema, hasRecentAuthentication, legalAcceptanceSchema, legalDestination } from "@/lib/legal";
import { createAdminSupabaseClient, createServerSupabaseClient } from "@/lib/supabase/server";
import { createRateLimiter } from "@/lib/rate-limit";
import { deleteAccountSafely } from "@/lib/account-deletion";
import { revokeStoredCalendarToken } from "@/lib/google/revoke-stored";
import type { FormActionState } from "@/lib/form-state";

const allowAccept = createRateLimiter({ limit: 10, windowMs: 60_000 });
const allowDelete = createRateLimiter({ limit: 3, windowMs: 15 * 60_000 });

export async function acceptLegalTerms(_previous: FormActionState, form: FormData): Promise<FormActionState> {
  const profile = await requireAccount();
  const parsed = legalAcceptanceSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { message: parsed.error.issues[0].message };
  if (!allowAccept(profile.id)) return { message: "Too many attempts. Wait a minute and try again." };
  const { error } = await (await createServerSupabaseClient()).rpc("accept_legal_terms", { p_version: parsed.data.version, p_agreed: true, p_eligible: true });
  if (error) return { message: "We could not record acceptance. Reload to check for updated Terms, or contact support." };
  redirect(legalDestination(typeof form.get("next") === "string" ? String(form.get("next")) : null));
}

export async function deleteOwnAccount(_previous: FormActionState, form: FormData): Promise<FormActionState> {
  const parsed = accountDeletionSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { message: parsed.error.issues[0].message };
  const supabase = await createServerSupabaseClient();
  // Auth confirms that this user still exists. getClaims verifies AMR; never
  // trust user-editable metadata, request IDs, or a token's refreshed iat.
  const [{ data: { user }, error: userError }, { data: verified, error: claimsError }] = await Promise.all([supabase.auth.getUser(), supabase.auth.getClaims()]);
  if (userError || !user || claimsError || verified?.claims.sub !== user.id) return { message: "Sign in again before deleting your account." };
  if (!hasRecentAuthentication(verified.claims)) return { message: "For your safety, sign out and sign in again, then return here within 10 minutes." };
  if (!allowDelete(user.id)) return { message: "Too many deletion attempts. Wait 15 minutes or contact support." };
  const { data: session } = await supabase.auth.getSession();
  if (!session.session?.access_token) return { message: "Sign in again before deleting your account." };
  const token = session.session.access_token;
  const admin = createAdminSupabaseClient();
  const result = await deleteAccountSafely({
    lock: async () => {
      const { error } = await admin.rpc("prepare_account_deletion", { p_user_id: user.id });
      if (error) throw new Error("Deletion lock failed.");
    },
    revokeSessions: async () => {
      const { error } = await admin.auth.admin.signOut(token, "global");
      if (error) throw new Error("Session revocation failed.");
    },
    revokeCalendar: () => revokeStoredCalendarToken(admin, user.id),
    deleteAccount: async () => {
      const { error } = await admin.auth.admin.deleteUser(user.id, false);
      if (error) throw new Error("Auth deletion failed.");
    },
  });
  if (result.status !== "deleted") return { message: result.message };
  // Local cookie removal cannot undo a successful server-side deletion.
  try { await supabase.auth.signOut({ scope: "local" }); } catch { /* The Auth user no longer exists. */ }
  redirect("/account-deleted");
}
