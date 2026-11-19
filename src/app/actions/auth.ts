"use server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

/**
 * Ends the session. It does not redirect: the caller (`SignOutButton`, the
 * account menu) leaves with a full page load to `/`, which drops the client
 * router's memory of the signed-in pages; a soft redirect would keep them a
 * Back press away (the router's back/forward cache).
 * `/` is the public landing when signed out (src/proxy.ts rewrites it to
 * /welcome), which is where sign-in now lives.
 */
export async function signOut() {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}
