"use server";

import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function signOut() {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
  // To the front page, not /login: signed out, `/` is the public landing
  // (src/proxy.ts rewrites it to /welcome), which is where sign-in now lives.
  redirect("/");
}
