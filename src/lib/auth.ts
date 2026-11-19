import { cache } from "react";
import { redirect } from "next/navigation";
import { createAdminSupabaseClient, createServerSupabaseClient } from "@/lib/supabase/server";
import { acceptancePath } from "./legal";
import { SESSION_HEADER, decodeSessionProfile } from "./session-context";
import { hasCurrentLegalAcceptance } from "./legal-server";
import { headers } from "next/headers";
import { isAllowlisted, parseAdminAllowlist } from "./admin-allowlist";

type Profile = {
  id: string;
  email: string;
  display_name: string | null;
  role: "USER" | "ADMIN";
  time_zone: string;
  week_starts_on: number;
  global_weekly_limit_minutes: number | null;
  disabled_at: string | null;
  deletion_pending_at: string | null;
};

function allowlisted(email: string) {
  return isAllowlisted(email, parseAdminAllowlist(process.env.ADMIN_EMAIL_ALLOWLIST));
}

/**
 * Memoised for the request. A layout, its page, and any helper they share all
 * ask for the profile; without `cache` that is one JWT verification and one
 * `profiles` round trip each.
 *
 * `getClaims` rather than `getUser`: with asymmetric JWT signing keys it
 * verifies the token locally against a cached JWKS instead of calling
 * `/auth/v1/user` on every render. On a project still signing with the
 * symmetric secret it falls back to exactly the `getUser` call this replaced,
 * so it is never slower and never less strict. `getSession` would be neither --
 * it trusts the cookie unverified.
 */
export const getSignedInProfile = cache(async (): Promise<Profile | null> => {
  const supabase = await createServerSupabaseClient();
  const { data: claimsResult } = await supabase.auth.getClaims();
  const user = claimsResult?.claims ? { id: claimsResult.claims.sub, email: claimsResult.claims.email } : null;
  if (!user?.email) return null;

  // The proxy already read this profile in get_session_context, for this
  // verified user, on workspace paths (session-context.ts). Otherwise read it.
  const requestHeaders = await headers();
  let profile: Profile | null = decodeSessionProfile(requestHeaders.get(SESSION_HEADER), user.id);
  if (!profile) {
    const { data: initialProfile, error: profileError } = await supabase.from("profiles").select("id,email,display_name,role,time_zone,week_starts_on,global_weekly_limit_minutes,disabled_at,deletion_pending_at").eq("id", user.id).maybeSingle();
    if (profileError) throw new Error("We could not load your account. Please try again.");
    profile = initialProfile as Profile | null;
  }

  if (!profile) {
    // Re-check with Auth before recreating a profile: a deleted account's JWT
    // can still verify cryptographically until its expiry.
    const { data: { user: liveUser } } = await supabase.auth.getUser();
    if (!liveUser) return null;
    const { error } = await supabase.from("profiles").insert({ id: liveUser.id, email: liveUser.email! });
    if (error) throw error;
    const result = await supabase.from("profiles").select("id,email,display_name,role,time_zone,week_starts_on,global_weekly_limit_minutes,disabled_at,deletion_pending_at").eq("id", user.id).single();
    if (result.error) throw result.error;
    profile = result.data;
  }

  // The allowlist grants the role and takes it back (admin-allowlist.ts): an
  // ADMIN whose email has left the list is demoted here, so the app and the
  // audit-log RLS, which both read the stored role, agree it is gone.
  const listed = allowlisted(user.email);
  const role = listed && !profile.deletion_pending_at ? "ADMIN" : profile.role === "ADMIN" && !listed ? "USER" : profile.role;
  if (role !== profile.role) {
    const admin = createAdminSupabaseClient();
    const { data, error } = await admin.from("profiles").update({ role }).eq("id", user.id).select("id,email,display_name,role,time_zone,week_starts_on,global_weekly_limit_minutes,disabled_at,deletion_pending_at").single();
    if (error) throw error;
    profile = data;
  }
  return profile as Profile;
});

/** Account rights deliberately do not require Terms acceptance or an enabled workspace. */
export async function requireAccount() {
  const profile = await getSignedInProfile();
  if (!profile) redirect("/login");
  return profile;
}

export async function requireUser() {
  const profile = await requireAccount();
  if (profile.deletion_pending_at) redirect("/account?deletion=pending");
  if (profile.disabled_at) redirect("/account-disabled");
  const requestHeaders = await headers();
  // The proxy sets SESSION_HEADER only once this user's agreement has passed
  // for this request (session-context.ts); otherwise ask the database.
  const acceptedUpstream = decodeSessionProfile(requestHeaders.get(SESSION_HEADER), profile.id) !== null;
  if (!acceptedUpstream && !await hasCurrentLegalAcceptance()) redirect(acceptancePath(requestHeaders.get("x-shiftsentry-path")));
  return profile;
}

export async function requireAdmin() {
  const profile = await requireUser();
  if (profile.role !== "ADMIN") redirect("/");
  return profile;
}
