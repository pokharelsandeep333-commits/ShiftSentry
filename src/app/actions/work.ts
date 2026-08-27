"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fromZonedTime } from "date-fns-tz";
import { requireUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { calculateEarnings, parseMoneyToCents, parsePercentToBasisPoints, totalDeductionRate, type DeductionSnapshot } from "@/lib/earnings";
import { deductionSchema, jobSchema, profileSettingsSchema, resourceIdSchema, shiftSchema } from "@/lib/validation";
import { parseShiftDateTimeInput } from "@/lib/shift-date-time";

function fail(message: string): never { throw new Error(message); }
function cents(value: FormDataEntryValue | null) { const result = parseMoneyToCents(String(value ?? "")); return result === null ? fail("Enter a valid hourly rate, such as 18.50.") : result; }
function basisPoints(value: FormDataEntryValue | null, label: string) { const result = parsePercentToBasisPoints(String(value ?? "")); return result === null ? fail(`Enter a valid ${label} between 0% and 100%.`) : result; }
function checkCombinedRate(taxRateBasisPoints: number, deductions: DeductionSnapshot[]) { if (taxRateBasisPoints + totalDeductionRate(deductions) > 10_000) fail("Tax and deductions together cannot exceed 100%."); }
function resourceId(formData: FormData, name = "id") { const parsed = resourceIdSchema.safeParse(formData.get(name)); return parsed.success ? parsed.data : fail("Invalid resource identifier."); }

export type ShiftActionState = { message: string; field: "startsAt" | "endsAt" | null };

type ShiftInput = { jobId: string; startsAt: Date; endsAt: Date; notes?: string };

function shiftError(message: string, field: ShiftActionState["field"] = null): ShiftActionState {
  return { message, field };
}

function parseShiftInput(formData: FormData, timeZone: string): { data: ShiftInput } | { error: ShiftActionState } {
  const start = parseShiftDateTimeInput(String(formData.get("startsAt") ?? ""));
  if (!start) return { error: shiftError("Enter a valid start date and time.", "startsAt") };
  const end = parseShiftDateTimeInput(String(formData.get("endsAt") ?? ""));
  if (!end) return { error: shiftError("Enter a valid end date and time.", "endsAt") };

  const startsAt = fromZonedTime(start.value, timeZone);
  const endsAt = fromZonedTime(end.value, timeZone);
  const parsed = shiftSchema.safeParse({ jobId: formData.get("jobId"), startsAt, endsAt, notes: formData.get("notes") });
  if (parsed.success) return { data: parsed.data };

  const issue = parsed.error.issues[0];
  return { error: shiftError(issue?.message ?? "Invalid shift.", issue?.path[0] === "startsAt" ? "startsAt" : issue?.path[0] === "endsAt" ? "endsAt" : null) };
}

function shiftDatabaseError(message: string): ShiftActionState {
  const normalized = message.toLowerCase();
  if (normalized.includes("global weekly limit")) return shiftError("This shift exceeds your global weekly limit.", "endsAt");
  if (normalized.includes("job weekly limit")) return shiftError("This shift exceeds this job's weekly limit.", "endsAt");
  if (normalized.includes("longer than zero") || normalized.includes("valid interval")) return shiftError("End time must be after start time.", "endsAt");
  if (normalized.includes("shifts_no_duplicate_span") || normalized.includes("duplicate key")) return shiftError("You already logged this exact shift.", "startsAt");
  return shiftError("We couldn't save this shift. Please try again.");
}

async function jobSnapshot(userId: string, jobId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from("jobs").select("id,archived_at,hourly_rate_cents,tax_rate_basis_points,job_deductions(name,rate_basis_points)").eq("id", jobId).eq("user_id", userId).maybeSingle();
  return { supabase, job: data, error };
}

function shiftPayload(input: ShiftInput, job: NonNullable<Awaited<ReturnType<typeof jobSnapshot>>["job"]>) {
  const deductions = (job.job_deductions ?? []).map((deduction) => ({ name: deduction.name, rateBasisPoints: deduction.rate_basis_points }));
  checkCombinedRate(job.tax_rate_basis_points, deductions);
  const snapshot = { hourlyRateCents: job.hourly_rate_cents, taxRateBasisPoints: job.tax_rate_basis_points, deductions };
  const pay = calculateEarnings(Math.floor((input.endsAt.getTime() - input.startsAt.getTime()) / 60_000), snapshot);
  return {
    job_id: input.jobId,
    starts_at: input.startsAt.toISOString(),
    ends_at: input.endsAt.toISOString(),
    notes: input.notes || null,
    hourly_rate_cents: snapshot.hourlyRateCents,
    tax_rate_basis_points: snapshot.taxRateBasisPoints,
    deductions_snapshot: snapshot.deductions,
    gross_cents: pay.grossCents,
    tax_cents: pay.taxCents,
    deduction_cents: pay.deductionCents,
    net_cents: pay.netCents,
  };
}

export async function createShift(_previousState: ShiftActionState, formData: FormData): Promise<ShiftActionState> {
  const profile = await requireUser();
  const input = parseShiftInput(formData, profile.time_zone);
  if ("error" in input) return input.error;
  const { supabase, job, error: jobError } = await jobSnapshot(profile.id, input.data.jobId);
  if (jobError || !job || job.archived_at) return shiftError("Choose one of your active jobs.");
  const { error } = await supabase.from("shifts").insert({ user_id: profile.id, ...shiftPayload(input.data, job) });
  if (error) return shiftDatabaseError(error.message);
  revalidatePath("/"); revalidatePath("/shifts"); redirect("/shifts");
}

export async function updateShift(_previousState: ShiftActionState, formData: FormData): Promise<ShiftActionState> {
  const profile = await requireUser();
  const id = resourceIdSchema.safeParse(formData.get("id"));
  if (!id.success) return shiftError("This shift could not be found.");
  const supabase = await createServerSupabaseClient();
  const { data: existing, error: existingError } = await supabase.from("shifts").select("id,job_id").eq("id", id.data).eq("user_id", profile.id).maybeSingle();
  if (existingError || !existing) return shiftError("This shift could not be found.");

  const input = parseShiftInput(formData, profile.time_zone);
  if ("error" in input) return input.error;
  const { data: job, error: jobError } = await supabase.from("jobs").select("id,archived_at,hourly_rate_cents,tax_rate_basis_points,job_deductions(name,rate_basis_points)").eq("id", input.data.jobId).eq("user_id", profile.id).maybeSingle();
  if (jobError || !job || (job.archived_at && job.id !== existing.job_id)) return shiftError("Choose one of your active jobs.");

  const { error } = await supabase.from("shifts").update(shiftPayload(input.data, job)).eq("id", existing.id).eq("user_id", profile.id);
  if (error) return shiftDatabaseError(error.message);
  revalidatePath("/"); revalidatePath("/shifts"); revalidatePath(`/shifts/${existing.id}/edit`); redirect("/shifts");
}

export async function deleteShift(formData: FormData) { const profile = await requireUser(); const id = resourceId(formData); const supabase = await createServerSupabaseClient(); const { error } = await supabase.from("shifts").delete().eq("id", id).eq("user_id", profile.id); if (error) fail("Unable to delete the shift. Please try again."); revalidatePath("/"); revalidatePath("/shifts"); }

export async function createJob(formData: FormData) {
  const profile = await requireUser(); const rawLimitHours = String(formData.get("weeklyLimitHours") ?? "");
  const limitMinutes = rawLimitHours ? Math.round(Number(rawLimitHours) * 60) : null;
  const parsed = jobSchema.safeParse({ name: formData.get("name"), color: formData.get("color"), weeklyLimitMinutes: limitMinutes, hourlyRateCents: cents(formData.get("hourlyRate")), taxRateBasisPoints: basisPoints(formData.get("taxRate"), "tax rate") });
  if (!parsed.success) fail(parsed.error.issues[0]?.message ?? "Invalid job.");
  const supabase = await createServerSupabaseClient(); const { error } = await supabase.from("jobs").insert({ user_id: profile.id, name: parsed.data.name, color: parsed.data.color, weekly_limit_minutes: parsed.data.weeklyLimitMinutes ?? null, hourly_rate_cents: parsed.data.hourlyRateCents, tax_rate_basis_points: parsed.data.taxRateBasisPoints });
  if (error) fail("Unable to create the job. Please try again."); revalidatePath("/"); revalidatePath("/jobs"); redirect("/jobs?saved=1");
}

export async function updateJobDetails(formData: FormData) {
  const profile = await requireUser(); const id = resourceId(formData); const hourlyRateCents = cents(formData.get("hourlyRate")); const taxRateBasisPoints = basisPoints(formData.get("taxRate"), "tax rate"); const color = String(formData.get("color") ?? ""); const supabase = await createServerSupabaseClient();
  if (!/^#[0-9A-Fa-f]{6}$/.test(color)) fail("Use a six-character hex color.");
  const { data: deductions, error: deductionError } = await supabase.from("job_deductions").select("name,rate_basis_points,jobs!inner(user_id)").eq("job_id", id).eq("jobs.user_id", profile.id);
  if (deductionError) fail("Unable to validate deductions. Please try again."); checkCombinedRate(taxRateBasisPoints, (deductions ?? []).map((item) => ({ name: item.name, rateBasisPoints: item.rate_basis_points })));
  const { error } = await supabase.from("jobs").update({ color, hourly_rate_cents: hourlyRateCents, tax_rate_basis_points: taxRateBasisPoints }).eq("id", id).eq("user_id", profile.id);
  if (error) fail("Unable to update job details. Please try again."); revalidatePath("/"); revalidatePath("/jobs");
}

export async function addJobDeduction(formData: FormData) {
  const profile = await requireUser(); const rateBasisPoints = basisPoints(formData.get("rate"), "deduction rate"); const parsed = deductionSchema.safeParse({ jobId: formData.get("jobId"), name: formData.get("name"), rateBasisPoints });
  if (!parsed.success) fail(parsed.error.issues[0]?.message ?? "Invalid deduction."); const supabase = await createServerSupabaseClient();
  const { data: job, error: jobError } = await supabase.from("jobs").select("tax_rate_basis_points,job_deductions(name,rate_basis_points)").eq("id", parsed.data.jobId).eq("user_id", profile.id).single();
  if (jobError || !job) fail("Job not found."); checkCombinedRate(job.tax_rate_basis_points, [...(job.job_deductions ?? []).map((item) => ({ name: item.name, rateBasisPoints: item.rate_basis_points })), { name: parsed.data.name, rateBasisPoints: parsed.data.rateBasisPoints }]);
  const { error } = await supabase.from("job_deductions").insert({ job_id: parsed.data.jobId, name: parsed.data.name, rate_basis_points: parsed.data.rateBasisPoints }); if (error) fail("Unable to add the deduction. Please try again."); revalidatePath("/jobs");
}

export async function deleteJobDeduction(formData: FormData) { await requireUser(); const id = resourceId(formData); const supabase = await createServerSupabaseClient(); const { error } = await supabase.from("job_deductions").delete().eq("id", id); if (error) fail("Unable to delete the deduction. Please try again."); revalidatePath("/jobs"); }

export async function archiveJob(formData: FormData) { const profile = await requireUser(); const id = resourceId(formData); const supabase = await createServerSupabaseClient(); const { error } = await supabase.from("jobs").update({ archived_at: new Date().toISOString() }).eq("id", id).eq("user_id", profile.id); if (error) fail("Unable to archive the job. Please try again."); revalidatePath("/"); revalidatePath("/jobs"); }

export async function deleteJob(formData: FormData) {
  const profile = await requireUser(); const id = resourceId(formData); const supabase = await createServerSupabaseClient();
  const [{ data: job }, { count, error: countError }] = await Promise.all([
    supabase.from("jobs").select("id,archived_at").eq("id", id).eq("user_id", profile.id).maybeSingle(),
    supabase.from("shifts").select("id", { count: "exact", head: true }).eq("job_id", id).eq("user_id", profile.id),
  ]);
  if (!job) fail("This job could not be found.");
  if (!job.archived_at) fail("Archive the job before deleting it.");
  if (countError) fail("Unable to delete the job. Please try again.");
  // shifts.job_id is ON DELETE RESTRICT so the database refuses this anyway; the
  // explicit check turns a constraint violation into a message worth reading.
  if (count) fail("This job still has shifts logged against it. Delete those shifts first.");
  const { error } = await supabase.from("jobs").delete().eq("id", id).eq("user_id", profile.id);
  if (error) fail("Unable to delete the job. Please try again.");
  revalidatePath("/"); revalidatePath("/jobs");
}

export async function unarchiveJob(formData: FormData) { const profile = await requireUser(); const id = resourceId(formData); const supabase = await createServerSupabaseClient(); const { error } = await supabase.from("jobs").update({ archived_at: null }).eq("id", id).eq("user_id", profile.id); if (error) fail("Unable to restore the job. Please try again."); revalidatePath("/"); revalidatePath("/jobs"); }

export async function updateSettings(formData: FormData) { const profile = await requireUser(); const limitHours = String(formData.get("globalWeeklyLimitHours") ?? ""); const limitMinutes = limitHours ? Math.round(Number(limitHours) * 60) : null; const parsed = profileSettingsSchema.safeParse({ displayName: formData.get("displayName"), timeZone: formData.get("timeZone"), weekStartsOn: formData.get("weekStartsOn"), globalWeeklyLimitMinutes: limitMinutes }); if (!parsed.success) fail(parsed.error.issues[0]?.message ?? "Invalid settings."); const supabase = await createServerSupabaseClient(); const { error } = await supabase.from("profiles").update({ display_name: parsed.data.displayName || null, time_zone: parsed.data.timeZone, week_starts_on: parsed.data.weekStartsOn, global_weekly_limit_minutes: parsed.data.globalWeeklyLimitMinutes ?? null }).eq("id", profile.id); if (error) fail("Unable to update settings. Please try again."); revalidatePath("/"); revalidatePath("/settings"); redirect("/settings?saved=1"); }
