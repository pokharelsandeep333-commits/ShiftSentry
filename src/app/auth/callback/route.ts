import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next") ?? "/";
  if (!code || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return NextResponse.redirect(new URL("/login?error=auth_configuration", url.origin));
  const response = NextResponse.redirect(new URL(next.startsWith("/") ? next : "/", url.origin));
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    cookies: { getAll: () => request.headers.get("cookie")?.split("; ").map((part) => { const [name, ...rest] = part.split("="); return { name, value: rest.join("=") }; }) ?? [], setAll: (values) => values.forEach(({ name, value, options }) => response.cookies.set(name, value, options)) },
  });
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(new URL("/login?error=callback", url.origin));
  return response;
}
