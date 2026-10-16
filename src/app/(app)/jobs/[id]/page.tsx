import { notFound } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { JobEditor } from "@/components/jobs/job-editor";
import { jobSavedMessage } from "@/components/jobs/saved-messages";
import { requireUser } from "@/lib/auth";
import { listCalendars } from "@/lib/google/client";
import { isGoogleCalendarEnabled } from "@/lib/google/config";
import { getConnectionSummary, withCalendarAccess } from "@/lib/google/connection";
import { JOB_PAY_COLUMNS } from "@/lib/pay-period";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { resourceIdSchema } from "@/lib/validation";

export const metadata = { title: "Job | ShiftSentry" };

export const dynamic = "force-dynamic";

export default async function JobPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string | string[] }> }) {
  const [profile, { id }, { saved }] = await Promise.all([requireUser(), params, searchParams]);
  // Not a uuid: no such job, and no reason to send it to Postgres.
  if (!resourceIdSchema.safeParse(id).success) notFound();
  const supabase = await createServerSupabaseClient();
  // Google settings show for any connected account, even when Google is
  // unreachable -- turning sync off must never depend on Google answering.
  const googleOn = isGoogleCalendarEnabled();
  const [{ data: job }, googleConnection, googleAccess] = await Promise.all([
    supabase.from("jobs").select(`id,name,color,archived_at,weekly_limit_minutes,hourly_rate_cents,tax_rate_basis_points,google_keyword,google_calendar_id,google_sync,${JOB_PAY_COLUMNS},job_deductions(id,name,rate_basis_points),shifts(count)`).eq("id", id).eq("user_id", profile.id).maybeSingle(),
    googleOn ? getConnectionSummary(profile.id) : Promise.resolve(null),
    googleOn ? withCalendarAccess(profile.id, (token) => listCalendars(token)) : Promise.resolve(null),
  ]);
  if (!job) notFound();

  const googleCalendars = googleConnection ? (googleAccess?.status === "ok" ? googleAccess.value : []) : null;
  const today = formatInTimeZone(new Date(), profile.time_zone, "yyyy-MM-dd");
  return <JobEditor job={job} googleOn={googleOn} googleCalendars={googleCalendars} today={today} savedMessage={jobSavedMessage(saved)} />;
}
