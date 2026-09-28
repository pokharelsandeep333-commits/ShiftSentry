import { NextResponse } from "next/server";
import { getSignedInProfile } from "@/lib/auth";
import { readGoogleCalendarConfig } from "@/lib/google/config";
import { OAUTH_COOKIE, OAUTH_COOKIE_PATH, buildAuthorizationUrl, createPkcePair, createState, encodeOAuthCookie, googleRedirectUri } from "@/lib/google/oauth";
import { createRateLimiter } from "@/lib/rate-limit";
import { publicRequestOrigin } from "@/lib/request-origin";

export const dynamic = "force-dynamic";

const allowConnect = createRateLimiter({ limit: 5, windowMs: 15 * 60_000 });

/** Starts the Google consent round trip. Reached by a plain link from Settings. */
export async function GET(request: Request) {
  const origin = publicRequestOrigin(request);
  const config = readGoogleCalendarConfig();
  if (!config) return new NextResponse(null, { status: 404 });
  const profile = await getSignedInProfile();
  if (!profile) return NextResponse.redirect(new URL("/login?next=%2Fsettings", origin));
  if (profile.disabled_at) return NextResponse.redirect(new URL("/account-disabled", origin));
  if (!allowConnect(profile.id)) return NextResponse.redirect(new URL("/settings?google=busy", origin));

  const state = createState();
  const { verifier, challenge } = createPkcePair();
  const response = NextResponse.redirect(buildAuthorizationUrl({ clientId: config.clientId, redirectUri: googleRedirectUri(origin), state, challenge }));
  response.cookies.set(OAUTH_COOKIE, encodeOAuthCookie({ state, verifier, userId: profile.id }), { httpOnly: true, sameSite: "lax", secure: origin.startsWith("https:"), path: OAUTH_COOKIE_PATH, maxAge: 600 });
  return response;
}
