import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { getSignedInProfile } from "@/lib/auth";
import { exchangeCode } from "@/lib/google/client";
import { readGoogleCalendarConfig } from "@/lib/google/config";
import { saveNewConnection } from "@/lib/google/connection";
import { OAUTH_COOKIE, OAUTH_COOKIE_PATH, decodeOAuthCookie, googleRedirectUri, hasRequiredScopes, statesMatch } from "@/lib/google/oauth";
import { publicRequestOrigin } from "@/lib/request-origin";

export const dynamic = "force-dynamic";

/**
 * Finishes the round trip. The state must match the cookie set by /connect for
 * this same signed-in user, both calendar scopes must have been granted (the
 * consent screen lets people untick them), and only then is anything stored.
 */
export async function GET(request: Request) {
  const origin = publicRequestOrigin(request);
  const config = readGoogleCalendarConfig();
  if (!config) return new NextResponse(null, { status: 404 });
  const url = new URL(request.url);
  const cookieStore = await cookies();
  const saved = decodeOAuthCookie(cookieStore.get(OAUTH_COOKIE)?.value);
  const back = (query: string) => {
    const response = NextResponse.redirect(new URL(`/settings?${query}`, origin));
    response.cookies.set(OAUTH_COOKIE, "", { path: OAUTH_COOKIE_PATH, maxAge: 0 });
    return response;
  };

  const profile = await getSignedInProfile();
  if (!profile) return NextResponse.redirect(new URL("/login?next=%2Fsettings", origin));
  if (profile.disabled_at) return NextResponse.redirect(new URL("/account-disabled", origin));
  if (url.searchParams.get("error")) return back("google=denied");
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code");
  if (!saved || saved.userId !== profile.id || !statesMatch(state, saved.state) || !code) return back("google=expired");
  if (!hasRequiredScopes(url.searchParams.get("scope") ?? undefined)) return back("google=scopes");

  try {
    const tokens = await exchangeCode(config, { code, verifier: saved.verifier, redirectUri: googleRedirectUri(origin) });
    if (!hasRequiredScopes(tokens.scope)) return back("google=scopes");
    await saveNewConnection(config, profile.id, tokens);
  } catch (error) {
    console.error("Google connect failed:", error instanceof Error ? error.name : "unknown");
    return back("google=failed");
  }
  return back("saved=google-connected");
}
