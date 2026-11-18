import "server-only";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { RunningTimer } from "@/lib/shift-timer";

/**
 * The viewer's running timer, read through RLS, with its job's name and colour
 * for the card and the span of the shift it adopted, if any. Not a dashboard
 * shift query (it reads `shift_timers`, embedding at most one shift), so the
 * dashboard keeps its two. A failed read shows the idle card: Start then meets
 * the one-timer key and answers "already on the clock", which reloads the real
 * one.
 */
export async function getRunningTimer(userId: string): Promise<RunningTimer | null> {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from("shift_timers").select("job_id,started_at,shift_id,jobs(name,color,archived_at),shifts(starts_at,ends_at)").eq("user_id", userId).maybeSingle();
  if (error || !data) return null;
  return {
    jobId: data.job_id,
    jobName: data.jobs?.name ?? "Job",
    jobColor: data.jobs?.color ?? "#98a2b3",
    jobArchived: Boolean(data.jobs?.archived_at),
    startedAt: data.started_at,
    adopted: data.shift_id && data.shifts ? { shiftId: data.shift_id, startsAt: data.shifts.starts_at, endsAt: data.shifts.ends_at } : null,
  };
}
