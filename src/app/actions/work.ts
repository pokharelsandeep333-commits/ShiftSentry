"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fromZonedTime } from "date-fns-tz";
import { requireUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { calculateEarnings, parseMoneyToCents, parsePercentToBasisPoints, totalDeductionRate, type DeductionSnapshot } from "@/lib/earnings";
import { deductionSchema, jobSchema, profileSettingsSchema, shiftSchema } from "@/lib/validation";

function fail(message: string): never { throw new Error(message); }
function cents(value: FormDataEntryValue | null) { const result = parseMoneyToCents(String(value ?? "")); return result === null ? fail("Enter a valid hourly rate, such as 18.50.") : result; }
function basisPoints(value: FormDataEntryValue | null, label: string) { const result = parsePercentToBasisPoints(String(value ?? "")); return result === null ? fail(`Enter a valid ${label} between 0% and 100%.`) : result; }
function checkCombinedRate(taxRateBasisPoints: number, deductions: DeductionSnapshot[]) { if (taxRateBasisPoints + totalDeductionRate(deductions) > 10_000) fail("Tax and deductions together cannot exceed 100%."); }

export async function createShift(formData: FormData) {
  const profile = await requireUser();
  const startsAt = fromZonedTime(String(formData.get("startsAt")), profile.time_zone);
  const endsAt = fromZonedTime(String(formData.get("endsAt")), profile.time_zone);
  const parsed = shiftSchema.safeParse({ jobId: formData.get("jobId"), startsAt, endsAt, notes: formData.get("notes") });
  if (!parsed.success) fail(parsed.error.issues[0]?.message ?? "Invalid shift.");
  const supabase = await createServerSupabaseClient();
  const { data: job, error: jobError } = await supabase.from("jobs").select("id,hourly_rate_cents,tax_rate_basis_points,job_deductions(name,rate_basis_points)").eq("id", parsed.data.jobId).eq("user_id", profile.id).is("archived_at", null).maybeSingle();
  if (jobError || !job) fail("Choose one of your active jobs.");
  const deductions = (job.job_deductions ?? []).map((deduction) => ({ name: deduction.name, rateBasisPoints: deduction.rate_basis_points }));
  checkCombinedRate(job.tax_rate_basis_points, deductions);
  const snapshot = { hourlyRateCents: job.hourly_rate_cents, taxRateBasisPoints: job.tax_rate_basis_points, deductions };
  const pay = calculateEarnings(Math.floor((parsed.data.endsAt.getTime() - parsed.data.startsAt.getTime()) / 60_000), snapshot);
  const { error } = await supabase.from("shifts").insert({ user_id: profile.id, job_id: parsed.data.jobId, starts_at: parsed.data.startsAt.toISOString(), ends_at: parsed.data.endsAt.toISOString(), notes: parsed.data.notes || null, hourly_rate_cents: snapshot.hourlyRateCents, tax_rate_basis_points: snapshot.taxRateBasisPoints, deductions_snapshot: snapshot.deductions, gross_cents: pay.grossCents, tax_cents: pay.taxCents, deduction_cents: pay.deductionCents, net_cents: pay.netCents });
  if (error) fail(error.message);
  revalidatePath("/"); revalidatePath("/shifts"); redirect("/shifts");
}

export async function deleteShift(formData: FormData) { const profile = await requireUser(); const supabase = await createServerSupabaseClient(); const { error } = await supabase.from("shifts").delete().eq("id", String(formData.get("id"))).eq("user_id", profile.id); if (error) fail(error.message); revalidatePath("/"); revalidatePath("/shifts"); }

export async function createJob(formData: FormData) {
  const profile = await requireUser(); const rawLimit = String(formData.get("weeklyLimitMinutes") ?? "");
  const parsed = jobSchema.safeParse({ name: formData.get("name"), color: formData.get("color"), weeklyLimitMinutes: rawLimit ? Number(rawLimit) : null, hourlyRateCents: cents(formData.get("hourlyRate")), taxRateBasisPoints: basisPoints(formData.get("taxRate"), "tax rate") });
  if (!parsed.success) fail(parsed.error.issues[0]?.message ?? "Invalid job.");
  const supabase = await createServerSupabaseClient(); const { error } = await supabase.from("jobs").insert({ user_id: profile.id, name: parsed.data.name, color: parsed.data.color, weekly_limit_minutes: parsed.data.weeklyLimitMinutes ?? null, hourly_rate_cents: parsed.data.hourlyRateCents, tax_rate_basis_points: parsed.data.taxRateBasisPoints });
  if (error) fail(error.message); revalidatePath("/"); revalidatePath("/jobs"); redirect("/jobs");
}

export async function updateJobPay(formData: FormData) {
  const profile = await requireUser(); const id = String(formData.get("id")); const hourlyRateCents = cents(formData.get("hourlyRate")); const taxRateBasisPoints = basisPoints(formData.get("taxRate"), "tax rate"); const supabase = await createServerSupabaseClient();
  const { data: deductions, error: deductionError } = await supabase.from("job_deductions").select("name,rate_basis_points,jobs!inner(user_id)").eq("job_id", id).eq("jobs.user_id", profile.id);
  if (deductionError) fail(deductionError.message); checkCombinedRate(taxRateBasisPoints, (deductions ?? []).map((item) => ({ name: item.name, rateBasisPoints: item.rate_basis_points })));
  const { error } = await supabase.from("jobs").update({ hourly_rate_cents: hourlyRateCents, tax_rate_basis_points: taxRateBasisPoints }).eq("id", id).eq("user_id", profile.id);
  if (error) fail(error.message); revalidatePath("/"); revalidatePath("/jobs");
}

export async function addJobDeduction(formData: FormData) {
  const profile = await requireUser(); const rateBasisPoints = basisPoints(formData.get("rate"), "deduction rate"); const parsed = deductionSchema.safeParse({ jobId: formData.get("jobId"), name: formData.get("name"), rateBasisPoints });
  if (!parsed.success) fail(parsed.error.issues[0]?.message ?? "Invalid deduction."); const supabase = await createServerSupabaseClient();
  const { data: job, error: jobError } = await supabase.from("jobs").select("tax_rate_basis_points,job_deductions(name,rate_basis_points)").eq("id", parsed.data.jobId).eq("user_id", profile.id).single();
  if (jobError || !job) fail("Job not found."); checkCombinedRate(job.tax_rate_basis_points, [...(job.job_deductions ?? []).map((item) => ({ name: item.name, rateBasisPoints: item.rate_basis_points })), { name: parsed.data.name, rateBasisPoints: parsed.data.rateBasisPoints }]);
  const { error } = await supabase.from("job_deductions").insert({ job_id: parsed.data.jobId, name: parsed.data.name, rate_basis_points: parsed.data.rateBasisPoints }); if (error) fail(error.message); revalidatePath("/jobs");
}

export async function deleteJobDeduction(formData: FormData) { await requireUser(); const id = String(formData.get("id")); const supabase = await createServerSupabaseClient(); const { error } = await supabase.from("job_deductions").delete().eq("id", id); if (error) fail(error.message); revalidatePath("/jobs"); }

export async function archiveJob(formData: FormData) { const profile = await requireUser(); const supabase = await createServerSupabaseClient(); const { error } = await supabase.from("jobs").update({ archived_at: new Date().toISOString() }).eq("id", String(formData.get("id"))).eq("user_id", profile.id); if (error) fail(error.message); revalidatePath("/"); revalidatePath("/jobs"); }

export async function updateSettings(formData: FormData) { const profile = await requireUser(); const limit = String(formData.get("globalWeeklyLimitMinutes") ?? ""); const parsed = profileSettingsSchema.safeParse({ displayName: formData.get("displayName"), timeZone: formData.get("timeZone"), weekStartsOn: formData.get("weekStartsOn"), globalWeeklyLimitMinutes: limit ? Number(limit) : null }); if (!parsed.success) fail(parsed.error.issues[0]?.message ?? "Invalid settings."); const supabase = await createServerSupabaseClient(); const { error } = await supabase.from("profiles").update({ display_name: parsed.data.displayName || null, time_zone: parsed.data.timeZone, week_starts_on: parsed.data.weekStartsOn, global_weekly_limit_minutes: parsed.data.globalWeeklyLimitMinutes ?? null }).eq("id", profile.id); if (error) fail(error.message); revalidatePath("/"); revalidatePath("/settings"); redirect("/"); }
