import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/database.types";
import { NEXT_COOKIE, publicRequestOrigin, safeInternalRedirect } from "@/lib/request-origin";
import { acceptancePath } from "@/lib/legal";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = publicRequestOrigin(request);
  const code = url.searchParams.get("code");
  const flowId = url.searchParams.get("sb_flow_id");
  const cookieStore = await cookies();
  // The query parameter first for anything that still sends one; otherwise the
  // cookie the login form left. Both go through the same same-origin check.
  const remembered = cookieStore.get(NEXT_COOKIE)?.value;
  let decoded: string | null = null;
  try { decoded = remembered ? decodeURIComponent(remembered) : null; } catch { /* A malformed cookie is not a redirect destination. */ }
  const next = safeInternalRedirect(url.searchParams.get("next") ?? decoded);
  if (!code || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) return NextResponse.redirect(new URL("/login?error=auth_configuration", origin));
  const response = NextResponse.redirect(new URL(next, origin));
  if (remembered) response.cookies.set(NEXT_COOKIE, "", { path: "/", maxAge: 0 });
  const supabase = createServerClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (values) => values.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
    },
  });
  const { error } = await supabase.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
  if (error) {
    console.error("Auth callback failed.");
    return NextResponse.redirect(new URL("/login?error=callback", origin));
  }
  const { data: accepted, error: agreementError } = await supabase.rpc("has_current_legal_acceptance");
  if (agreementError || accepted !== true) response.headers.set("Location", new URL(acceptancePath(next), origin).href);
  return response;
}
