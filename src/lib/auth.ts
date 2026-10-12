import { cache } from "react";
import { redirect } from "next/navigation";
import { createAdminSupabaseClient, createServerSupabaseClient } from "@/lib/supabase/server";
import { acceptancePath } from "./legal";
import { hasCurrentLegalAcceptance } from "./legal-server";
import { headers } from "next/headers";

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
  const values = (process.env.ADMIN_EMAIL_ALLOWLIST ?? "").split(",").map((value) => value.trim().toLowerCase()).filter(Boolean);
  return values.includes(email.toLowerCase());
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

  const { data: initialProfile, error: profileError } = await supabase.from("profiles").select("id,email,display_name,role,time_zone,week_starts_on,global_weekly_limit_minutes,disabled_at,deletion_pending_at").eq("id", user.id).maybeSingle();
  if (profileError) throw new Error("We could not load your account. Please try again.");
  let profile = initialProfile;

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

  if (allowlisted(user.email) && profile.role !== "ADMIN" && !profile.deletion_pending_at) {
    const admin = createAdminSupabaseClient();
    const { data, error } = await admin.from("profiles").update({ role: "ADMIN" }).eq("id", user.id).select("id,email,display_name,role,time_zone,week_starts_on,global_weekly_limit_minutes,disabled_at,deletion_pending_at").single();
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
  if (!await hasCurrentLegalAcceptance()) redirect(acceptancePath((await headers()).get("x-shiftsentry-path")));
  return profile;
}

export async function requireAdmin() {
  const profile = await requireUser();
  if (profile.role !== "ADMIN") redirect("/");
  return profile;
}
