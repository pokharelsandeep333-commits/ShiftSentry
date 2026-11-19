/**
 * Runs once when a server instance starts, before it answers requests.
 * Node only: the admin Supabase client is not for the edge runtime.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { reconcileAdminRoles } = await import("@/lib/admin-revocation");
  // Bounded, so a slow database never holds the server's start hostage.
  await Promise.race([reconcileAdminRoles(), new Promise((resolve) => setTimeout(resolve, 5_000))]);
}
