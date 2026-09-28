import { NextResponse } from "next/server";
import { getSignedInProfile } from "@/lib/auth";
import { findClashes } from "@/lib/calendar-clash";
import { listEvents } from "@/lib/google/client";
import { withCalendarAccess } from "@/lib/google/connection";
import { createRateLimiter } from "@/lib/rate-limit";
import { isSameShift } from "@/lib/shift-match";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const allowCheck = createRateLimiter({ limit: 60, windowMs: 60_000 });
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });

/**
 * A route, not a Server Action: Next.js runs Server Actions one at a time, so a
 * slow Google call made as one would hold up the form's Save. Events for the
 * span are fetched, compared, returned, and dropped -- nothing is stored.
 */
export async function GET(request: Request) {
  const profile = await getSignedInProfile();
  if (!profile || profile.disabled_at) return json({ status: "not_connected" }, 401);
  if (!allowCheck(profile.id)) return json({ status: "busy" }, 429);
  const url = new URL(request.url);
  const start = Date.parse(url.searchParams.get("start") ?? "");
  const end = Date.parse(url.searchParams.get("end") ?? "");
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end - start > 24 * 60 * 60_000) return json({ status: "unavailable" }, 400);
  const range = { startsAt: new Date(start).toISOString(), endsAt: new Date(end).toISOString() };
  // The job being entered, so a Google copy of this very shift reads as a match, not a clash.
  const jobId = url.searchParams.get("job");
  const supabase = await createServerSupabaseClient();
  const { data: job } = jobId ? await supabase.from("jobs").select("name,google_keyword").eq("id", jobId).eq("user_id", profile.id).maybeSingle() : { data: null };

  const result = await withCalendarAccess(profile.id, (token, calendarIds) => listEvents(token, calendarIds, { timeMin: range.startsAt, timeMax: range.endsAt }, profile.time_zone));
  if (result.status !== "ok") return json({ status: result.status });
  const copies = result.value.filter((event) => isSameShift(event, { jobName: job?.name ?? "", keyword: job?.google_keyword, ...range }));
  const others = result.value.filter((event) => !copies.includes(event));
  const pick = ({ id, title, startsAt, endsAt }: (typeof result.value)[number]) => ({ id, title, startsAt, endsAt });
  return json({ status: "ok", clashes: findClashes(range, others).map(pick), matches: copies.map(pick) });
}
