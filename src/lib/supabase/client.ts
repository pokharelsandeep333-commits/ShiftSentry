import { createBrowserClient } from "@supabase/ssr";
import { requireSupabaseConfig } from "./config";
import type { Database } from "./database.types";

export function createClient() {
  const { url, publishableKey } = requireSupabaseConfig();
  return createBrowserClient<Database>(url, publishableKey);
}
