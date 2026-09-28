import { NextResponse } from "next/server";
import { getSignedInProfile } from "@/lib/auth";
import { isGoogleCalendarEnabled } from "@/lib/google/config";
import { syncGoogleShifts } from "@/lib/google/shift-sync";
import { publicRequestOrigin } from "@/lib/request-origin";

export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * Runs a Google shift sync for the signed-in user. POST only, and only from
 * this site: it writes shifts, so a cross-site page must not be able to start
 * one. The pages call it after they render, so they never wait on Google.
 */
export async function POST(request: Request) {
  if (!isGoogleCalendarEnabled()) return new NextResponse(null, { status: 404 });
  const origin = request.headers.get("origin");
  if (!origin || origin !== publicRequestOrigin(request)) return json({ status: "forbidden" }, 403);
  const profile = await getSignedInProfile();
  if (!profile || profile.disabled_at) return json({ status: "not_connected" }, 401);
  const force = new URL(request.url).searchParams.get("force") === "1";
  return json(await syncGoogleShifts(profile, { force }));
}
