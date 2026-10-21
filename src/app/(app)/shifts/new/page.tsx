export const metadata = { title: "New shift | ShiftSentry" };

import Link from "next/link";
import { ShiftEditorPage } from "@/components/shifts/shift-editor-page";
import { buttonVariants } from "@/components/ui/button";
import { formatInTimeZone } from "date-fns-tz";
import { ShiftForm, type LastTimes, type ShiftFormJob } from "@/components/shifts/shift-form";
import { requireUser } from "@/lib/auth";
import { isGoogleCalendarEnabled } from "@/lib/google/config";
import { getConnectionSummary } from "@/lib/google/connection";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { parseShiftDateTimeInput } from "@/lib/shift-date-time";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

function single(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * Prefill from a "Duplicate" link or an empty hour on the calendar. Every field
 * is treated as untrusted URL input: both timestamps have to parse, and a job,
 * when one is named, has to be one of the viewer's active jobs -- otherwise the
 * form opens blank. The calendar names no job, so the first active job is used.
 */
function prefillFromQuery(params: SearchParams, jobs: ShiftFormJob[]) {
  const jobId = single(params.jobId) ?? jobs[0]?.id;
  const startsAt = parseShiftDateTimeInput(single(params.startsAt) ?? "");
  const endsAt = parseShiftDateTimeInput(single(params.endsAt) ?? "");
  if (!jobId || !jobs.some((job) => job.id === jobId) || !startsAt || !endsAt) return undefined;
  return { jobId, startsAt: startsAt.value, endsAt: endsAt.value, notes: (single(params.notes) ?? "").slice(0, 500) || null };
}

export default async function NewShiftPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const profile = await requireUser();
  const calendarCheck = isGoogleCalendarEnabled() && (await getConnectionSummary(profile.id)) !== null;
  const supabase = await createServerSupabaseClient();
  const [{ data: jobs }, { data: recent }, params] = await Promise.all([
    supabase.from("jobs").select("id,name,color,hourly_rate_cents,tax_rate_basis_points,job_deductions(name,rate_basis_points)").eq("user_id", profile.id).is("archived_at", null).order("name"),
    // The latest shifts already worked, newest first, for "Same as last time".
    supabase.from("shifts").select("job_id,starts_at,ends_at").eq("user_id", profile.id).lte("starts_at", new Date().toISOString()).order("starts_at", { ascending: false }).limit(100),
    searchParams,
  ]);
  const selectableJobs: ShiftFormJob[] = (jobs ?? []).map((job) => ({ id: job.id, name: job.name, color: job.color, hourlyRateCents: job.hourly_rate_cents, taxRateBasisPoints: job.tax_rate_basis_points, deductions: (job.job_deductions ?? []).map((deduction) => ({ name: deduction.name, rateBasisPoints: deduction.rate_basis_points })) }));
  const initialShift = prefillFromQuery(params, selectableJobs);
  const lastTimes: Record<string, LastTimes> = {};
  for (const shift of recent ?? []) {
    lastTimes[shift.job_id] ??= { start: formatInTimeZone(shift.starts_at, profile.time_zone, "HH:mm"), end: formatInTimeZone(shift.ends_at, profile.time_zone, "HH:mm") };
  }

  return <ShiftEditorPage title="Add shift" description="Pick the job and the times. You'll see your weekly totals before you save.">
    {selectableJobs.length ? <ShiftForm calendarCheck={calendarCheck} lastTimes={lastTimes} mode="create" jobs={selectableJobs} timeZone={profile.time_zone} initialShift={initialShift} /> : <div className="shift-google-editor"><p className="mb-4 text-sm text-[var(--muted-foreground)]">Create a job before adding a shift.</p><Link href="/jobs/new" className={buttonVariants()}>Create a job</Link></div>}
  </ShiftEditorPage>;
}
