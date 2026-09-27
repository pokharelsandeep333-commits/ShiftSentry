import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/database.types";
import { contentSecurityPolicy, createNonce } from "@/lib/content-security-policy";

export async function proxy(request: NextRequest) {
  // Set on the request so Next.js can find the nonce while it renders, and on
  // the response so the browser enforces it. `set`, not `append`: a client that
  // sends its own `x-nonce` must not get to choose the value.
  const nonce = createNonce();
  const csp = contentSecurityPolicy({ nonce, supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL, development: process.env.NODE_ENV === "development" });
  request.headers.set("x-nonce", nonce);
  request.headers.set("Content-Security-Policy", csp);

  const response = await route(request);
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

async function route(request: NextRequest) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) return NextResponse.next({ request });
  let response = NextResponse.next({ request });
  const supabase = createServerClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { cookies: { getAll: () => request.cookies.getAll(), setAll: (values) => { values.forEach(({ name, value }) => request.cookies.set(name, value)); response = NextResponse.next({ request }); values.forEach(({ name, value, options }) => response.cookies.set(name, value, options)); } } });
  const { data: { user } } = await supabase.auth.getUser();
  // An invite link or a QR scan is the one deep link people follow signed out.
  // `requireUser()` on the page would bounce to /login and forget the code, so
  // the redirect is issued here with `next` set, the way /admin already does.
  if (!user && request.nextUrl.pathname.startsWith("/game/")) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    url.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(url);
  }
  // The site's root is its public home page for anyone signed out: Google's
  // OAuth review rejects a home page that is only a login wall. A rewrite, not
  // a redirect, so the address stays `/`; signed-in visitors fall through to
  // the dashboard at the same URL.
  if (!user && request.nextUrl.pathname === "/") {
    const url = request.nextUrl.clone();
    url.pathname = "/welcome";
    return rewriteWithCookies(url, request, response);
  }
  if (request.nextUrl.pathname.startsWith("/admin")) {
    if (!user) { const url = request.nextUrl.clone(); url.pathname = "/login"; url.searchParams.set("next", request.nextUrl.pathname); return NextResponse.redirect(url); }
    const { data: profile } = await supabase.from("profiles").select("role,disabled_at").eq("id", user.id).maybeSingle();
    if (profile?.disabled_at) { const url = request.nextUrl.clone(); url.pathname = "/account-disabled"; return NextResponse.redirect(url); }
    if (profile?.role !== "ADMIN") { const url = request.nextUrl.clone(); url.pathname = "/"; return NextResponse.redirect(url); }
  }
  return response;
}

/**
 * A rewrite has to carry what the ordinary response would have: the request
 * headers (the nonce rides on them) and any session cookies `getUser` just
 * refreshed or cleared, or a stale session would be set again on every visit.
 */
function rewriteWithCookies(url: URL, request: NextRequest, from: NextResponse) {
  const rewritten = NextResponse.rewrite(url, { request });
  from.cookies.getAll().forEach((cookie) => rewritten.cookies.set(cookie));
  return rewritten;
}

export const config ={ matcher: ["/((?!_next/static|_next/image|favicon.ico|api/health|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"] };
