import { NextResponse } from "next/server";
import { fromZonedTime } from "date-fns-tz";
import { getSignedInProfile } from "@/lib/auth";
import { checkOccurrences, type Occurrence } from "@/lib/limit-check";
import { createRateLimiter } from "@/lib/rate-limit";
import { addWeeksToLocalDateTime, parseShiftDateTimeInput } from "@/lib/shift-date-time";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { weekEndFor, weekStartFor } from "@/lib/time";
import { resourceIdSchema } from "@/lib/validation";

export const dynamic = "force-dynamic";

const allowCheck = createRateLimiter({ limit: 60, windowMs: 60_000 });
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
/** The repeats the create form offers (`REPEAT_WEEK_CHOICES` in the shift actions). */
const REPEATS = new Set([1, 2, 4, 6, 8, 12]);

/**
 * Would this shift, and its weekly repeats, be accepted? The form asks while
 * the times are being picked, so a refused week shows up before Save rather
 * than as a skipped repeat after it. A route rather than a Server Action for
 * the clash check's reason: Server Actions run one at a time, and this must
 * never hold up Save.
 *
 * Takes the picker's local wall-clock times and builds the repeats exactly as
 * `createShift` does, then reads the viewer's own shifts through RLS. Every
 * shift counts, archived jobs' included, because the trigger counts them.
 * Nothing is written.
 */
export async function GET(request: Request) {
  const profile = await getSignedInProfile();
  if (!profile || profile.disabled_at || profile.deletion_pending_at) return json({ status: "unavailable" }, 401);
  if (!allowCheck(profile.id)) return json({ status: "busy" }, 429);

  const url = new URL(request.url);
  const start = parseShiftDateTimeInput(url.searchParams.get("start") ?? "");
  const end = parseShiftDateTimeInput(url.searchParams.get("end") ?? "");
  const job = resourceIdSchema.safeParse(url.searchParams.get("job"));
  const exclude = url.searchParams.get("exclude");
  const excludeId = exclude ? resourceIdSchema.safeParse(exclude) : null;
  const repeat = Number(url.searchParams.get("repeat") ?? 1);
  if (!start || !end || !job.success || (excludeId && !excludeId.success) || !REPEATS.has(repeat)) return json({ status: "unavailable" }, 400);

  const timeZone = profile.time_zone;
  const occurrences: Occurrence[] = [];
  for (let week = 0; week < repeat; week += 1) {
    const startsAt = addWeeksToLocalDateTime(start.value, week);
    const endsAt = addWeeksToLocalDateTime(end.value, week);
    if (!startsAt || !endsAt) return json({ status: "unavailable" }, 400);
    occurrences.push({ startsAt: fromZonedTime(startsAt, timeZone), endsAt: fromZonedTime(endsAt, timeZone) });
  }
  const last = occurrences[occurrences.length - 1];
  const windowStart = weekStartFor(occurrences[0].startsAt, timeZone, profile.week_starts_on);
  const windowEnd = weekEndFor(weekStartFor(last.endsAt, timeZone, profile.week_starts_on), timeZone, profile.week_starts_on);

  const supabase = await createServerSupabaseClient();
  const [jobs, shifts] = await Promise.all([
    supabase.from("jobs").select("id,name,weekly_limit_minutes").eq("user_id", profile.id),
    supabase.from("shifts").select("id,job_id,starts_at,ends_at").eq("user_id", profile.id).lt("starts_at", windowEnd.toISOString()).gt("ends_at", windowStart.toISOString()).order("starts_at").limit(1000),
  ]);
  if (jobs.error || shifts.error) return json({ status: "unavailable" }, 500);
  const chosen = jobs.data.find((candidate) => candidate.id === job.data);
  if (!chosen) return json({ status: "unavailable" }, 404);
  const jobNames = new Map(jobs.data.map((candidate) => [candidate.id, candidate.name]));

  const results = checkOccurrences({
    occurrences,
    jobId: chosen.id,
    existing: shifts.data.map((shift) => ({ id: shift.id, jobId: shift.job_id, startsAt: new Date(shift.starts_at), endsAt: new Date(shift.ends_at) })),
    excludeId: excludeId?.success ? excludeId.data : null,
    timeZone,
    weekStartsOn: profile.week_starts_on,
    globalLimit: profile.global_weekly_limit_minutes,
    jobLimit: chosen.weekly_limit_minutes,
  });

  return json({
    status: "ok",
    jobName: chosen.name,
    globalLimit: profile.global_weekly_limit_minutes,
    jobLimit: chosen.weekly_limit_minutes,
    occurrences: results.map((result) => ({
      startsAt: result.startsAt.toISOString(),
      endsAt: result.endsAt.toISOString(),
      fits: result.fits,
      over: result.over,
      badSpan: result.badSpan,
      overlap: result.overlap ? { jobName: jobNames.get(result.overlap.jobId) ?? "Another job", startsAt: result.overlap.startsAt.toISOString(), endsAt: result.overlap.endsAt.toISOString() } : null,
      weeks: result.weeks.map((week) => ({ weekStart: week.weekStart.toISOString(), globalAfter: week.globalAfter, jobAfter: week.jobAfter })),
    })),
  });
}
