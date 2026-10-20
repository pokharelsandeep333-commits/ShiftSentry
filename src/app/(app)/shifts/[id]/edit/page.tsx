export const metadata = { title: "Edit shift | ShiftSentry" };

import { notFound } from "next/navigation";
import { formatInTimeZone } from "date-fns-tz";
import { ShiftLog } from "@/components/shifts/shift-log";
import { ShiftPanel } from "@/components/shifts/shift-panel";
import { ShiftForm } from "@/components/shifts/shift-form";
import { requireUser } from "@/lib/auth";
import { isGoogleCalendarEnabled } from "@/lib/google/config";
import { getConnectionSummary } from "@/lib/google/connection";
import { stopFollowingGoogle, updateShiftNotes } from "@/app/actions/work";
import { SubmitButton } from "@/components/ui/submit-button";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** Read at request time; a synced shift that has started no longer follows Google. */
function hasStarted(startsAt: string) {
  return Date.parse(startsAt) <= new Date().getTime();
}

export default async function EditShiftPage({ params }: { params: Promise<{ id: string }> }) {
  const profile = await requireUser();
  const calendarCheck = isGoogleCalendarEnabled() && (await getConnectionSummary(profile.id)) !== null;
  const { id } = await params;
  const supabase = await createServerSupabaseClient();
  const [{ data: shift }, { data: jobs }] = await Promise.all([
    supabase.from("shifts").select("id,job_id,starts_at,ends_at,notes,hourly_rate_cents,tax_rate_basis_points,deductions_snapshot,google_event_id").eq("id", id).eq("user_id", profile.id).maybeSingle(),
    supabase.from("jobs").select("id,name,color,hourly_rate_cents,tax_rate_basis_points,job_deductions(name,rate_basis_points),archived_at").eq("user_id", profile.id).order("name"),
  ]);
  if (!shift) notFound();

  // The pay the shift was worked at, so the form previews what will actually be
  // saved rather than the job's present rate.
  const paySnapshot = { hourlyRateCents: shift.hourly_rate_cents, taxRateBasisPoints: shift.tax_rate_basis_points, deductions: Array.isArray(shift.deductions_snapshot) ? shift.deductions_snapshot as { name: string; rateBasisPoints: number }[] : [] };

  const selectableJobs = (jobs ?? []).filter((job) => !job.archived_at || job.id === shift.job_id).map((job) => ({ id: job.id, name: job.name, color: job.color, archived: Boolean(job.archived_at), hourlyRateCents: job.hourly_rate_cents, taxRateBasisPoints: job.tax_rate_basis_points, deductions: (job.job_deductions ?? []).map((deduction) => ({ name: deduction.name, rateBasisPoints: deduction.rate_basis_points })) }));

  // A synced shift follows its Google event, so here it is read-only apart from its notes.
  if (shift.google_event_id) {
    const job = (jobs ?? []).find((candidate) => candidate.id === shift.job_id);
    const started = hasStarted(shift.starts_at);
    const description = started
      ? "This shift has started, so changes in Google Calendar no longer move it. To correct it, stop following Google and edit it here."
      : "This shift follows its event in Google Calendar: change the time there and it updates here on the next sync. Or stop following Google and edit it here.";
    return <div className="shift-workspace"><ShiftLog searchParams={Promise.resolve({})} /><ShiftPanel title="Shift from Google Calendar"><div className="shift-google-editor grid content-start gap-5">
          <p className="text-sm leading-6 text-[var(--muted-foreground)]">{description}</p><h2 className="font-semibold">{job?.name ?? "Shift"}</h2>
          <p className="text-sm text-[var(--muted-foreground)]">{formatInTimeZone(shift.starts_at, profile.time_zone, "EEEE, MMM d · h:mm a")} – {formatInTimeZone(shift.ends_at, profile.time_zone, "h:mm a")}</p>
          <form action={updateShiftNotes} className="grid gap-3">
            <input type="hidden" name="id" value={shift.id} />
            <label className="field-label"><span>Notes</span><textarea name="notes" defaultValue={shift.notes ?? ""} maxLength={500} className="field-textarea text-sm" placeholder="Optional notes" /></label>
            <div><SubmitButton label="Save notes" pendingLabel="Saving…" /></div>
          </form>
          <form action={stopFollowingGoogle} className="border-t pt-5">
            <input type="hidden" name="id" value={shift.id} />
            <p className="mb-3 text-sm text-[var(--muted-foreground)]">Stop following Google to change the job or times here. Google Calendar will no longer update this shift, and its event won&apos;t be added again.</p>
            <SubmitButton label="Stop following Google and edit here" pendingLabel="Updating…" variant="outline" />
          </form>
        </div></ShiftPanel></div>;
  }

  return <div className="shift-workspace"><ShiftLog searchParams={Promise.resolve({})} /><ShiftPanel title="Edit shift">
    <ShiftForm calendarCheck={calendarCheck} mode="edit" jobs={selectableJobs} timeZone={profile.time_zone} initialShift={{ id: shift.id, jobId: shift.job_id, startsAt: formatInTimeZone(shift.starts_at, profile.time_zone, "yyyy-MM-dd'T'HH:mm"), endsAt: formatInTimeZone(shift.ends_at, profile.time_zone, "yyyy-MM-dd'T'HH:mm"), notes: shift.notes, paySnapshot }} />
  </ShiftPanel></div>;
}
