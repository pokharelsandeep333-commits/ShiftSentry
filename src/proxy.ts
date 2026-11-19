import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import type { Database } from "@/lib/supabase/database.types";
import { contentSecurityPolicy, createNonce } from "@/lib/content-security-policy";
import { safeInternalRedirect } from "@/lib/request-origin";
import { acceptancePath } from "@/lib/legal";
import { SESSION_HEADER, encodeSessionProfile, type SessionProfile } from "@/lib/session-context";

export async function proxy(request: NextRequest) {
  // Set on the request so Next.js can find the nonce while it renders, and on
  // the response so the browser enforces it. `set`, not `append`: a client that
  // sends its own `x-nonce` must not get to choose the value.
  const nonce = createNonce();
  const csp = contentSecurityPolicy({ nonce, supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL, development: process.env.NODE_ENV === "development" });
  request.headers.set("x-nonce", nonce);
  request.headers.set("Content-Security-Policy", csp);
  // Overwrite any caller-supplied value; guards use this only for a safe return path.
  request.headers.set("x-shiftsentry-path", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  // Set below only once this request's agreement check has passed, so a
  // client-sent value never survives (see SESSION_HEADER).
  request.headers.delete(SESSION_HEADER);

  const response = await route(request);
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

async function route(request: NextRequest) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) return NextResponse.next({ request });
  let response = NextResponse.next({ request });
  const supabase = createServerClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { cookies: { getAll: () => request.cookies.getAll(), setAll: (values) => { values.forEach(({ name, value }) => request.cookies.set(name, value)); response = NextResponse.next({ request }); values.forEach(({ name, value, options }) => response.cookies.set(name, value, options)); } } });
  // getClaims, not getUser: this project signs with ES256, so the JWT is
  // verified locally against the cached JWKS instead of a round trip to
  // /auth/v1/user on every request; it still refreshes an expired session
  // through setAll above. The pages have verified this way since 3169d83, and
  // disabled, deleted and pending-deletion accounts are still refused by the
  // profile checks in requireUser() and by the database.
  const { data: claimsResult } = await supabase.auth.getClaims();
  const userId = typeof claimsResult?.claims?.sub === "string" ? claimsResult.claims.sub : null;
  const user = userId ? { id: userId } : null;
  let sessionProfile: SessionProfile | null = null;
  if (user && (request.nextUrl.pathname === "/" || /^\/(?:admin|game|shifts|jobs|calendar|pay-periods|settings|integrations)(?:\/|$)/.test(request.nextUrl.pathname))) {
    // Profile and agreement in one call (get_session_context), not two.
    const { data: context, error } = await supabase.rpc("get_session_context");
    const session = !error && context && typeof context === "object" && !Array.isArray(context) ? context as { accepted?: unknown; profile?: unknown } : null;
    const accepted = session?.accepted === true;
    sessionProfile = session?.profile && typeof session.profile === "object" ? session.profile as SessionProfile : null;
    if (session && !accepted) {
      const destination = acceptancePath(`${request.nextUrl.pathname}${request.nextUrl.search}`);
      const redirect = NextResponse.redirect(new URL(destination, request.nextUrl.origin));
      response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
      return redirect;
    }
    if (accepted && sessionProfile?.id === user.id) {
      // Hand the profile to the page so getSignedInProfile() and
      // requireUser() skip their own reads (session-context.ts). The
      // response is rebuilt so the forwarded request headers include it,
      // keeping any refreshed cookies.
      request.headers.set(SESSION_HEADER, encodeSessionProfile(sessionProfile));
      const forwarded = NextResponse.next({ request });
      response.cookies.getAll().forEach((cookie) => forwarded.cookies.set(cookie));
      response = forwarded;
    }
  }
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
  // Someone already signed in has no use for the sign-in page, so /login sends
  // them where they were headed (`next`, same-origin paths only) or to the
  // dashboard. Session cookies `getUser` refreshed ride along, as on the
  // rewrite below.
  if (user && request.nextUrl.pathname === "/login") {
    const url = new URL(safeInternalRedirect(request.nextUrl.searchParams.get("next")), request.nextUrl.origin);
    const redirect = NextResponse.redirect(url);
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie));
    return redirect;
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
    // /admin is a workspace path, so the session context above already holds
    // this profile; read it only if that call failed.
    const profile = sessionProfile?.id === user.id ? sessionProfile : (await supabase.from("profiles").select("role,disabled_at").eq("id", user.id).maybeSingle()).data;
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
