import type { ReactNode } from "react";
import { AppShell } from "@/components/app-shell";
import { requireUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";

/**
 * The chrome for every signed-in route. It lives here rather than inside each
 * page for two reasons: a shared layout is not re-rendered when you navigate
 * between its children, so the sidebar and bottom bar stay mounted and only the
 * page body swaps -- and `requireUser()` runs once per full load instead of once
 * per navigation.
 *
 * `/login`, `/account-disabled` and `/offline` sit outside this group because
 * they must render without a session.
 */
export default async function AppLayout({ children }: { children: ReactNode }) {
  if (!isSupabaseConfigured()) return <AppShell isDemo>{children}</AppShell>;
  const profile = await requireUser();

  return <AppShell isAdmin={profile.role === "ADMIN"} userEmail={profile.email}>{children}</AppShell>;
}
