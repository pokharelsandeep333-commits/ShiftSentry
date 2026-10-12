import "server-only";
import { cache } from "react";
import { createServerSupabaseClient } from "./supabase/server";

export const hasCurrentLegalAcceptance = cache(async () => {
  const { data, error } = await (await createServerSupabaseClient()).rpc("has_current_legal_acceptance");
  if (error) throw new Error("We could not check your agreement. Please try again.");
  return data === true;
});
