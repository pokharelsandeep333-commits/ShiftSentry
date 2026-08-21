import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/database.types";
import { publicRequestOrigin } from "@/lib/request-origin";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = publicRequestOrigin(request);
  const code = url.searchParams.get("code");
  const flowId = url.searchParams.get("sb_flow_id");
  const next = url.searchParams.get("next") ?? "/";
  if (!code || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) return NextResponse.redirect(new URL("/login?error=auth_configuration", origin));
  const cookieStore = await cookies();
  const response = NextResponse.redirect(new URL(next.startsWith("/") ? next : "/", origin));
  const supabase = createServerClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (values) => values.forEach(({ name, value, options }) => response.cookies.set(name, value, options)),
    },
  });
  const { error } = await supabase.auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined);
  if (error) {
    console.error("Auth callback error:", error);
    return NextResponse.redirect(new URL("/login?error=callback", origin));
  }
  return response;
}
