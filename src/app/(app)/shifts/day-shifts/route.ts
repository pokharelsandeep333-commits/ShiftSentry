import { NextResponse } from "next/server";
import { fromZonedTime } from "date-fns-tz";
import { z } from "zod";
import { getSignedInProfile } from "@/lib/auth";
import { addLocalDays } from "@/lib/day-track";
import { createRateLimiter } from "@/lib/rate-limit";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const allowRead = createRateLimiter({ limit: 60, windowMs: 60_000 });
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { "Cache-Control": "no-store" } });
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine((value) => addLocalDays(value, 0) === value);

type JobRef = { name: string; color: string };

/**
 * The viewer's shifts touching seven local days from `from`, for the shift
 * editor's day track: it draws them so a clash is visible before Save. Read
 * through RLS; archived jobs' shifts are included because they still block an
 * overlap. Nothing is written, and only the job's name and colour go back,
 * never notes. A route rather than a Server Action for the limit check's
 * reason: Server Actions run one at a time, and this must never hold up Save.
 */
export async function GET(request: Request) {
  const profile = await getSignedInProfile();
  if (!profile || profile.disabled_at || profile.deletion_pending_at) return json({ status: "unavailable" }, 401);
  if (!allowRead(profile.id)) return json({ status: "busy" }, 429);

  const from = dateSchema.safeParse(new URL(request.url).searchParams.get("from"));
  if (!from.success) return json({ status: "unavailable" }, 400);

  const windowStart = fromZonedTime(`${from.data}T00:00:00`, profile.time_zone);
  const windowEnd = fromZonedTime(`${addLocalDays(from.data, 7)}T00:00:00`, profile.time_zone);
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from("shifts").select("id,starts_at,ends_at,jobs(name,color)").eq("user_id", profile.id).lt("starts_at", windowEnd.toISOString()).gt("ends_at", windowStart.toISOString()).order("starts_at").limit(500);
  if (error) return json({ status: "unavailable" }, 500);

  return json({
    status: "ok",
    shifts: data.map((shift) => {
      const job = (Array.isArray(shift.jobs) ? shift.jobs[0] : shift.jobs) as JobRef | null;
      return { id: shift.id, jobName: job?.name ?? "Archived job", color: job?.color ?? "#98a2b3", startsAt: shift.starts_at, endsAt: shift.ends_at };
    }),
  });
}
