import "server-only";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { adminsToRevoke, parseAdminAllowlist } from "@/lib/admin-allowlist";

/**
 * Demotes every ADMIN whose email is no longer in `ADMIN_EMAIL_ALLOWLIST`.
 * Run once at server start (`src/instrumentation.ts`): a deploy is how the list
 * changes, so a removed admin loses the role, in the app and in the audit-log
 * RLS that reads it, before the new server answers a single request, even if
 * they never open the app again. `getSignedInProfile` repeats the check per
 * request. Never throws: a failure is logged and the per-request check stands.
 */
export async function reconcileAdminRoles() {
  if (!isSupabaseConfigured() || !process.env.SUPABASE_SECRET_KEY) return;
  try {
    const admin = createAdminSupabaseClient();
    const { data, error } = await admin.from("profiles").select("id,email").eq("role", "ADMIN");
    if (error) throw error;
    const revoked = adminsToRevoke(data ?? [], parseAdminAllowlist(process.env.ADMIN_EMAIL_ALLOWLIST));
    if (!revoked.length) return;
    const { error: updateError } = await admin.from("profiles").update({ role: "USER" }).in("id", revoked.map((row) => row.id)).eq("role", "ADMIN");
    if (updateError) throw updateError;
    console.info(`Admin allowlist: revoked the ADMIN role from ${revoked.length} account(s) no longer listed.`);
  } catch {
    // No driver error text: it can carry connection details.
    console.error("Admin allowlist: could not reconcile admin roles at startup; the per-request check still applies.");
  }
}
