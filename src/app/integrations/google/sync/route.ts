import { NextResponse } from "next/server";
import { getSignedInProfile } from "@/lib/auth";
import { isGoogleCalendarEnabled } from "@/lib/google/config";
import { syncGoogleShifts } from "@/lib/google/shift-sync";
import { createRateLimiter } from "@/lib/rate-limit";
import { publicRequestOrigin } from "@/lib/request-origin";

export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

// The database claim is the real budget (one run per 5 minutes, 30 s forced).
// These two keep a flood of requests from costing a database round trip each,
// and keep a forced run from starting while a slow one is still going.
const allowSync = createRateLimiter({ limit: 10, windowMs: 60_000 });
const running = new Set<string>();

/**
 * Browsers mark every request with Sec-Fetch-Site, and a cross-site page
 * cannot forge it. Without it (an older browser), fall back to comparing the
 * Origin's host with the public host -- hosts, not whole origins, so a port or
 * scheme Nginx reports differently cannot lock the feature out.
 */
function isSameSite(request: Request) {
  const fetchSite = request.headers.get("sec-fetch-site");
  if (fetchSite) return fetchSite === "same-origin";
  const origin = request.headers.get("origin");
  if (!origin) return false;
  try {
    return new URL(origin).hostname === new URL(publicRequestOrigin(request)).hostname;
  } catch {
    return false;
  }
}

/**
 * Runs a Google shift sync for the signed-in user. POST only, and only from
 * this site: it writes shifts, so a cross-site page must not be able to start
 * one. The pages call it after they render, so they never wait on Google.
 */
export async function POST(request: Request) {
  if (!isGoogleCalendarEnabled()) return new NextResponse(null, { status: 404 });
  if (!isSameSite(request)) return json({ status: "forbidden" }, 403);
  const profile = await getSignedInProfile();
  if (!profile || profile.disabled_at) return json({ status: "not_connected" }, 401);
  if (!allowSync(profile.id)) return json({ status: "skipped", changed: 0 }, 429);
  if (running.has(profile.id)) return json({ status: "skipped", changed: 0 });
  const force = new URL(request.url).searchParams.get("force") === "1";
  running.add(profile.id);
  try {
    return json(await syncGoogleShifts(profile, { force }));
  } finally {
    running.delete(profile.id);
  }
}
