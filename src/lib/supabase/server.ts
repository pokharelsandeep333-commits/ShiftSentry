import { createServerClient } from "@supabase/ssr";
import { createAdminClient } from "@supabase/server/core";
import { cookies } from "next/headers";
import { requireSupabaseConfig } from "./config";
import type { Database } from "./database.types";

export async function createServerSupabaseClient() {
  const { url, publishableKey } = requireSupabaseConfig();
  const cookieStore = await cookies();
  return createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll(values) {
        try { values.forEach(({ name, value, options }) => cookieStore.set(name, value, options)); } catch { /* Server Components cannot set cookies. */ }
      },
    },
  });
}

export function createAdminSupabaseClient() {
  const { url } = requireSupabaseConfig();
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!secretKey) throw new Error("SUPABASE_SECRET_KEY is required for this administrative action.");
  return createAdminClient<Database>({
    env: {
      url,
      secretKeys: { default: secretKey },
    },
  });
}
