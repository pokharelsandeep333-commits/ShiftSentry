"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import { requireUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { UNLINKED_SHIFT } from "@/lib/google/unlink";
import { seriesIdOf, withEventIgnored, withSeriesIgnored } from "@/lib/google-sync-plan";
import { calculateEarnings, parseMoneyToCents, parsePercentToBasisPoints, totalDeductionRate, type DeductionSnapshot, type PaySnapshot } from "@/lib/earnings";
import { deductionSchema, jobSchema, payScheduleFormSchema, profileSettingsSchema, resourceIdSchema, shiftSchema, timerStartedAtSchema, weekNoteSchema } from "@/lib/validation";
import { isWeekStart } from "@/lib/week-notes";
import { addWeeksToLocalDateTime, parseShiftDateTimeInput } from "@/lib/shift-date-time";
import { clampWeeks, readShiftFilters, shiftLogHref } from "@/lib/shift-log";
import { emptyTimerState, type FormActionState, type SavedFormState, type TimerActionState } from "@/lib/form-state";
import { ADOPT_EARLY_MINUTES, adoptableShift, timerEditorHref, timerShift } from "@/lib/shift-timer";
import { formatMinutes } from "@/lib/utils";

function fail(message: string): never { throw new Error(message); }
function cents(value: FormDataEntryValue | null) { const result = parseMoneyToCents(String(value ?? "")); return result === null ? fail("Enter a valid hourly rate, such as 18.50.") : result; }
function basisPoints(value: FormDataEntryValue | null, label: string) { const result = parsePercentToBasisPoints(String(value ?? "")); return result === null ? fail(`Enter a valid ${label} between 0% and 100%.`) : result; }
function checkCombinedRate(taxRateBasisPoints: number, deductions: DeductionSnapshot[]) { if (taxRateBasisPoints + totalDeductionRate(deductions) > 10_000) fail("Tax and deductions together cannot exceed 100%."); }
function weeklyLimitMinutes(value: FormDataEntryValue | null) {
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const hours = Number(raw);
  if (!Number.isFinite(hours) || hours <= 0 || hours > 168) fail("Enter a weekly limit between 1 and 168 hours, or leave it blank for no cap.");
  return Math.round(hours * 60);
}
/** The job form's pay schedule fields as `jobs` columns. A form without them (an older page) means no schedule. */
function paySchedule(formData: FormData) {
  const parsed = payScheduleFormSchema.safeParse({ frequency: formData.get("payFrequency") ?? "none", anchorDate: formData.get("payAnchorDate"), monthDay: formData.get("payMonthDay"), paydayOffsetDays: formData.get("paydayOffsetDays") });
  return parsed.success ? parsed.data : fail(parsed.error.issues[0]?.message ?? "Check the pay schedule.");
}
function resourceId(formData: FormData, name = "id") { const parsed = resourceIdSchema.safeParse(formData.get(name)); return parsed.success ? parsed.data : fail("Invalid resource identifier."); }

export type ShiftActionState = { message: string; field: "startsAt" | "endsAt" | null };

/**
 * Run a mutation and turn a rejection into a message the form can render.
 *
 * The helpers above signal invalid input by throwing text written for a person
 * to read ("Enter a valid hourly rate, such as 18.50."). Uncaught, that text
 * never reaches whoever typed the value: a thrown Server Action surfaces as the
 * dev error overlay, or a generic failure in production. Catching it here is
 * what makes writing those messages worth anything.
 *
 * `redirect()` stays outside, because Next.js implements it by throwing too and
 * swallowing that would strand the user on the form.
 */
async function attempt(run: () => Promise<void>): Promise<string | null> {
  try {
    await run();
    return null;
  } catch (error) {
    return error instanceof Error && error.message ? error.message : "Something went wrong. Please try again.";
  }
}

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
  if (normalized.includes("shifts_no_overlap") || normalized.includes("exclusion constraint")) return shiftError("This overlaps a shift you have already logged.", "startsAt");
  return shiftError("We couldn't save this shift. Please try again.");
}

async function jobSnapshot(userId: string, jobId: string) {
  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.from("jobs").select("id,archived_at,hourly_rate_cents,tax_rate_basis_points,job_deductions(name,rate_basis_points)").eq("id", jobId).eq("user_id", userId).maybeSingle();
  return { supabase, job: data, error };
}

/** The columns of a job that decide what a shift is worth. */
type JobPayRow = { hourly_rate_cents: number; tax_rate_basis_points: number; job_deductions: { name: string; rate_basis_points: number }[] | null };

function paySnapshotFromJob(job: JobPayRow): PaySnapshot {
  const deductions = (job.job_deductions ?? []).map((deduction) => ({ name: deduction.name, rateBasisPoints: deduction.rate_basis_points }));
  checkCombinedRate(job.tax_rate_basis_points, deductions);
  return { hourlyRateCents: job.hourly_rate_cents, taxRateBasisPoints: job.tax_rate_basis_points, deductions };
}

/**
 * The pay a shift is recorded against travels with the shift, not with the job,
 * so a later raise cannot reprice work already done. `sync_shift_earnings_snapshot`
 * is the authority on these columns; sending them keeps the two implementations
 * comparable and the form's preview honest.
 */
function shiftPayload(input: ShiftInput, snapshot: PaySnapshot) {
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

/** Weekly repeats the create form offers. Anything else falls back to a single shift. */
const REPEAT_WEEK_CHOICES = new Set([1, 2, 4, 6, 8, 12]);

function repeatWeeksFrom(formData: FormData) {
  const weeks = Number(formData.get("repeatWeeks") ?? 1);
  return REPEAT_WEEK_CHOICES.has(weeks) ? weeks : 1;
}

/**
 * The same shift shifted forward by whole weeks, in the viewer's local calendar
 * so the wall-clock hour survives a DST change. Returns null when the bumped
 * value cannot be parsed, so the caller skips that week rather than storing a
 * garbage interval.
 */
function occurrenceAt(input: ShiftInput, week: number, timeZone: string): ShiftInput | null {
  if (week === 0) return input;
  const startsAt = addWeeksToLocalDateTime(formatInTimeZone(input.startsAt, timeZone, "yyyy-MM-dd'T'HH:mm"), week);
  const endsAt = addWeeksToLocalDateTime(formatInTimeZone(input.endsAt, timeZone, "yyyy-MM-dd'T'HH:mm"), week);
  if (!startsAt || !endsAt) return null;
  return { ...input, startsAt: fromZonedTime(startsAt, timeZone), endsAt: fromZonedTime(endsAt, timeZone) };
}

export async function createShift(_previousState: ShiftActionState, formData: FormData): Promise<ShiftActionState> {
  const profile = await requireUser();
  const input = parseShiftInput(formData, profile.time_zone);
  if ("error" in input) return input.error;
  const { supabase, job, error: jobError } = await jobSnapshot(profile.id, input.data.jobId);
  if (jobError || !job || job.archived_at) return shiftError("Choose one of your active jobs.");

  // Insert each week on its own so a single collision -- a duplicate span or a
  // weekly cap -- skips that week instead of failing the whole repeat.
  const weeks = repeatWeeksFrom(formData);
  const snapshot = paySnapshotFromJob(job);
  let created = 0;
  let firstCreated = false;
  let firstFailure: ShiftActionState | null = null;

  for (let week = 0; week < weeks; week += 1) {
    const occurrence = occurrenceAt(input.data, week, profile.time_zone);
    if (!occurrence) { firstFailure ??= shiftError("We couldn't schedule one of the repeats."); continue; }
    const { error } = await supabase.from("shifts").insert({ user_id: profile.id, ...shiftPayload(occurrence, snapshot) });
    if (error) firstFailure ??= shiftDatabaseError(error.message);
    else { created += 1; if (week === 0) firstCreated = true; }
  }

  if (!created) return firstFailure ?? shiftError("We couldn't save this shift. Please try again.");
  // Opened from a running timer (timerEditorHref): the shift just saved is that
  // timer's, so the clock stops. Matched on the exact start, so a link to a
  // timer that has since been stopped and restarted leaves the new one alone.
  const timer = timerStartedAtSchema.safeParse(formData.get("timerStartedAt"));
  if (firstCreated && timer.success) await supabase.from("shift_timers").delete().eq("user_id", profile.id).eq("started_at", timer.data);
  revalidatePath("/"); revalidatePath("/shifts");
  redirect(`/shifts?created=${created}&skipped=${weeks - created}`);
}

export async function updateShift(_previousState: ShiftActionState, formData: FormData): Promise<ShiftActionState> {
  const profile = await requireUser();
  const id = resourceIdSchema.safeParse(formData.get("id"));
  if (!id.success) return shiftError("This shift could not be found.");
  const supabase = await createServerSupabaseClient();
  const { data: existing, error: existingError } = await supabase.from("shifts").select("id,job_id,hourly_rate_cents,tax_rate_basis_points,deductions_snapshot,google_event_id").eq("id", id.data).eq("user_id", profile.id).maybeSingle();
  if (existingError || !existing) return shiftError("This shift could not be found.");
  // A synced shift follows its Google event; only its notes are edited here.
  if (existing.google_event_id) return shiftError("This shift follows Google Calendar. Choose “Stop following Google” to edit it here.");

  const input = parseShiftInput(formData, profile.time_zone);
  if ("error" in input) return input.error;
  const { data: job, error: jobError } = await supabase.from("jobs").select("id,archived_at,hourly_rate_cents,tax_rate_basis_points,job_deductions(name,rate_basis_points)").eq("id", input.data.jobId).eq("user_id", profile.id).maybeSingle();
  if (jobError || !job || (job.archived_at && job.id !== existing.job_id)) return shiftError("Choose one of your active jobs.");

  // Editing a shift must not reprice it. The stored snapshot is what the work
  // was worth when it was worked, so it carries over untouched unless the shift
  // moves to a different job -- where the old job's rate no longer describes it.
  // This mirrors sync_shift_earnings_snapshot, which is authoritative.
  const snapshot: PaySnapshot = input.data.jobId === existing.job_id
    ? { hourlyRateCents: existing.hourly_rate_cents, taxRateBasisPoints: existing.tax_rate_basis_points, deductions: Array.isArray(existing.deductions_snapshot) ? existing.deductions_snapshot as DeductionSnapshot[] : [] }
    : paySnapshotFromJob(job);
  const { error } = await supabase.from("shifts").update(shiftPayload(input.data, snapshot)).eq("id", existing.id).eq("user_id", profile.id);
  if (error) return shiftDatabaseError(error.message);
  // Opened from a running timer that adopted this shift (timerEditorHref):
  // saving the corrected times is the clock-out, so the timer stops. Matched
  // on the exact start and this shift, so a stale link stops nothing else.
  const timer = timerStartedAtSchema.safeParse(formData.get("timerStartedAt"));
  if (timer.success) await supabase.from("shift_timers").delete().eq("user_id", profile.id).eq("started_at", timer.data).eq("shift_id", existing.id);
  revalidatePath("/"); revalidatePath("/shifts"); revalidatePath(`/shifts/${existing.id}/edit`); redirect("/shifts");
}

function timerError(message: string, editHref: string | null = null): TimerActionState {
  return { ...emptyTimerState, message, editHref };
}

function revalidateTimer() { revalidatePath("/"); revalidatePath("/shifts"); }

/**
 * Clock in: start the one running timer this account may have, on one of its
 * active jobs. The database stamps the start (`prepare_shift_timer`), so the
 * clock reads the same on every device and cannot be backdated from here.
 *
 * A shift already logged for this time is adopted rather than refused
 * (`adoptableShift`): the one under way, or the chosen job's next one starting
 * within half an hour. Stop then rewrites that shift's times instead of adding
 * a second shift that could only overlap it. A shift under way on a different
 * job is refused, with a way to edit it, rather than logged under a job the
 * person did not pick.
 */
export async function startShiftTimer(_previous: TimerActionState, formData: FormData): Promise<TimerActionState> {
  const profile = await requireUser();
  const jobId = resourceIdSchema.safeParse(formData.get("jobId"));
  if (!jobId.success) return timerError("Choose one of your active jobs.");
  const supabase = await createServerSupabaseClient();
  const now = new Date();
  const soon = new Date(now.getTime() + ADOPT_EARLY_MINUTES * 60_000);
  const [{ data: job, error: jobError }, { data: nearby, error: nearbyError }] = await Promise.all([
    supabase.from("jobs").select("id,archived_at").eq("id", jobId.data).eq("user_id", profile.id).maybeSingle(),
    supabase.from("shifts").select("id,job_id,starts_at,ends_at,jobs(name)").eq("user_id", profile.id).lte("starts_at", soon.toISOString()).gt("ends_at", now.toISOString()).order("starts_at").limit(10),
  ]);
  if (jobError || !job || job.archived_at) return timerError("Choose one of your active jobs.");
  if (nearbyError) return timerError("We couldn't start the timer. Please try again.");

  const adoption = adoptableShift((nearby ?? []).map((row) => ({ ...row, jobId: row.job_id, startsAt: new Date(row.starts_at), endsAt: new Date(row.ends_at) })), job.id, now);
  if (adoption && !adoption.sameJob) {
    const name = adoption.shift.jobs?.name ?? "Another job";
    const span = `${formatInTimeZone(adoption.shift.starts_at, profile.time_zone, "h:mm a")}–${formatInTimeZone(adoption.shift.ends_at, profile.time_zone, "h:mm a")}`;
    return timerError(`${name} ${span} is logged for right now. Choose ${name} to clock into it, or edit that shift if you are working something else.`, `/shifts/${adoption.shift.id}/edit`);
  }

  const { error } = await supabase.from("shift_timers").insert({ user_id: profile.id, job_id: job.id, shift_id: adoption?.shift.id ?? null });
  if (error) {
    // Started on another device a moment ago: show that one.
    if (error.code === "23505") { revalidateTimer(); return timerError("A shift is already on the clock."); }
    if (error.code === "23514") return timerError("Choose one of your active jobs.");
    return timerError("We couldn't start the timer. Please try again.");
  }
  revalidateTimer();
  return emptyTimerState;
}

/**
 * Clock out. A timer on its own becomes a new shift through exactly the path
 * `createShift` takes; one that adopted a logged shift rewrites that shift
 * through the path `updateShift` takes, keeping its pay snapshot and notes as
 * any edit that keeps the job does. Either way it is Zod's span checks, then an
 * ordinary write the triggers and constraints judge like any other. Only once
 * that write is accepted is the timer deleted, so a refused stop (a weekly cap,
 * an overlap, a span over 24 hours) leaves the clock running and nothing is
 * lost; the card then offers the editor, filled in with these times.
 *
 * Both ends are whole minutes (`timerShift`). A second Stop from another
 * device cannot log the shift twice: it finds the timer gone, or its insert
 * overlaps the first and `shifts_no_overlap` refuses it.
 */
export async function stopShiftTimer(_previous: TimerActionState, formData: FormData): Promise<TimerActionState> {
  const profile = await requireUser();
  const supabase = await createServerSupabaseClient();
  const { data: timer, error: timerReadError } = await supabase.from("shift_timers").select("job_id,started_at,shift_id,jobs(name)").eq("user_id", profile.id).maybeSingle();
  if (timerReadError) return timerError("We couldn't stop the timer. Please try again.");
  if (!timer) { revalidateTimer(); return timerError("This shift was already stopped."); }
  const shown = timerStartedAtSchema.safeParse(formData.get("startedAt"));
  if (shown.success && Date.parse(shown.data) !== Date.parse(timer.started_at)) { revalidateTimer(); return timerError("This timer changed on another device. Check it and try again."); }

  // The adopted shift, if it still exists (deleting it sets shift_id to null).
  const { data: adopted } = timer.shift_id
    ? await supabase.from("shifts").select("id,job_id,starts_at,ends_at,notes,hourly_rate_cents,tax_rate_basis_points,deductions_snapshot,google_event_id").eq("id", timer.shift_id).eq("user_id", profile.id).maybeSingle()
    : { data: null };

  const now = new Date();
  const shift = timerShift(new Date(timer.started_at), now);
  const editHref = timerEditorHref({ jobId: timer.job_id, startedAt: timer.started_at, adopted: adopted ? { shiftId: adopted.id, startsAt: adopted.starts_at, endsAt: adopted.ends_at } : null }, now, profile.time_zone);
  if (shift.status === "too-short") {
    await supabase.from("shift_timers").delete().eq("user_id", profile.id).eq("started_at", timer.started_at);
    revalidateTimer();
    return { ...emptyTimerState, logged: adopted ? "Stopped within a minute, so the shift was left as planned." : "Stopped within a minute, so nothing was logged.", loggedAt: Date.now() };
  }
  if (shift.status === "too-long") return timerError("This timer has run for more than 24 hours, longer than one shift can be. Set the time you actually stopped.", editHref);

  const jobName = timer.jobs?.name;
  if (adopted) {
    const parsed = shiftSchema.safeParse({ jobId: adopted.job_id, startsAt: shift.startsAt, endsAt: shift.endsAt, notes: adopted.notes ?? "" });
    if (!parsed.success) return timerError(parsed.error.issues[0]?.message ?? "Invalid shift.", editHref);
    // Same job, so the snapshot it was logged at carries over untouched, as in
    // updateShift (sync_shift_earnings_snapshot is authoritative).
    const snapshot: PaySnapshot = { hourlyRateCents: adopted.hourly_rate_cents, taxRateBasisPoints: adopted.tax_rate_basis_points, deductions: Array.isArray(adopted.deductions_snapshot) ? adopted.deductions_snapshot as DeductionSnapshot[] : [] };
    // A shift from Google Calendar stops following it, exactly as "Stop
    // following Google" does before an edit: its event is remembered so sync
    // does not add it back, and the real times stay. Sync never moves a
    // started shift anyway.
    if (adopted.google_event_id && !(await forgetGoogleEvent(supabase, profile.id, adopted.id))) return timerError("We couldn't stop the timer. Please try again.", editHref);
    const { error } = await supabase.from("shifts").update({ ...shiftPayload(parsed.data, snapshot), ...(adopted.google_event_id ? UNLINKED_SHIFT : {}) }).eq("id", adopted.id).eq("user_id", profile.id);
    if (error) return timerError(shiftDatabaseError(error.message).message, editHref);
  } else {
    const parsed = shiftSchema.safeParse({ jobId: timer.job_id, startsAt: shift.startsAt, endsAt: shift.endsAt });
    if (!parsed.success) return timerError(parsed.error.issues[0]?.message ?? "Invalid shift.", editHref);
    const { job, error: jobError } = await jobSnapshot(profile.id, timer.job_id);
    if (jobError || !job) return timerError("This job could not be found.");
    if (job.archived_at) return timerError("This job was archived while the shift was running. Restore it under Jobs, or discard the timer.");
    const problem = await attempt(async () => {
      const { error } = await supabase.from("shifts").insert({ user_id: profile.id, ...shiftPayload(parsed.data, paySnapshotFromJob(job)) });
      if (error) fail(shiftDatabaseError(error.message).message);
    });
    if (problem) return timerError(problem, editHref);
  }

  const { error: clearError } = await supabase.from("shift_timers").delete().eq("user_id", profile.id).eq("started_at", timer.started_at);
  revalidateTimer(); revalidatePath("/calendar");
  if (adopted) revalidatePath(`/shifts/${adopted.id}/edit`);
  const logged = `Logged ${formatMinutes(shift.minutes)}${jobName ? ` at ${jobName}` : ""}`;
  // Saved, but the clock is still showing: a later Stop would overlap this
  // shift and be refused, so say so rather than leave it to look stuck.
  if (clearError) return { ...timerError(`${logged}, but the timer kept running. Discard it.`), logged, loggedAt: Date.now() };
  return { ...emptyTimerState, logged, loggedAt: Date.now() };
}

/** Throws the running timer away without logging anything. */
export async function discardShiftTimer(formData: FormData) {
  const profile = await requireUser();
  const supabase = await createServerSupabaseClient();
  let query = supabase.from("shift_timers").delete().eq("user_id", profile.id);
  const shown = timerStartedAtSchema.safeParse(formData.get("startedAt"));
  if (shown.success) query = query.eq("started_at", shown.data);
  const { error } = await query;
  if (error) fail("Unable to discard the timer. Please try again.");
  revalidateTimer();
}

export async function deleteShift(formData: FormData) {
  const profile = await requireUser();
  const id = resourceId(formData);
  const wholeSeries = formData.get("scope") === "series";
  const supabase = await createServerSupabaseClient();
  // A synced shift the user deletes stays deleted: its event -- or, when they
  // choose, every occurrence of its repeating event -- goes on the job's ignore
  // list so the next Google sync does not add it back.
  const remembered = wholeSeries ? await stopGoogleSeries(supabase, profile.id, id) : await forgetGoogleEvent(supabase, profile.id, id);
  if (!remembered) fail("Unable to delete the shift. Please try again.");
  const { error } = await supabase.from("shifts").delete().eq("id", id).eq("user_id", profile.id);
  if (error) fail("Unable to delete the shift. Please try again.");
  revalidatePath("/"); revalidatePath("/shifts"); revalidatePath("/calendar");
  // Back to the same depth and filters the delete was made from.
  redirect(shiftLogHref(clampWeeks(formData.get("weeks")), readShiftFilters((name) => formData.get(name)), { saved: wholeSeries ? "series-stopped" : "shift-deleted" }));
}

export async function createJob(_previousState: FormActionState, formData: FormData): Promise<FormActionState> {
  const profile = await requireUser();
  let createdId = "";
  const problem = await attempt(async () => {
    const parsed = jobSchema.safeParse({ name: formData.get("name"), color: formData.get("color"), weeklyLimitMinutes: weeklyLimitMinutes(formData.get("weeklyLimitHours")), hourlyRateCents: cents(formData.get("hourlyRate")), taxRateBasisPoints: basisPoints(formData.get("taxRate"), "tax rate") });
    if (!parsed.success) fail(parsed.error.issues[0]?.message ?? "Invalid job.");
    const schedule = paySchedule(formData);
    const supabase = await createServerSupabaseClient();
    const { data: created, error } = await supabase.from("jobs").insert({ user_id: profile.id, name: parsed.data.name, color: parsed.data.color, weekly_limit_minutes: parsed.data.weeklyLimitMinutes ?? null, hourly_rate_cents: parsed.data.hourlyRateCents, tax_rate_basis_points: parsed.data.taxRateBasisPoints, ...schedule }).select("id").single();
    if (error || !created) fail("Unable to create the job. Please try again.");
    createdId = created.id;
  });
  if (problem) return { message: problem };
  // Land on the new job's page: deductions and Google settings are added there.
  revalidatePath("/"); revalidatePath("/jobs"); redirect(`/jobs/${createdId}?saved=job-created`);
}

export async function updateJobDetails(_previousState: FormActionState, formData: FormData): Promise<FormActionState> {
  const profile = await requireUser();
  let id = "";
  const problem = await attempt(async () => {
    id = resourceId(formData);
    const parsed = jobSchema.safeParse({ name: formData.get("name"), color: formData.get("color"), weeklyLimitMinutes: weeklyLimitMinutes(formData.get("weeklyLimitHours")), hourlyRateCents: cents(formData.get("hourlyRate")), taxRateBasisPoints: basisPoints(formData.get("taxRate"), "tax rate") });
    if (!parsed.success) fail(parsed.error.issues[0]?.message ?? "Invalid job.");
    const schedule = paySchedule(formData);
    const supabase = await createServerSupabaseClient();
    const { data: deductions, error: deductionError } = await supabase.from("job_deductions").select("name,rate_basis_points,jobs!inner(user_id)").eq("job_id", id).eq("jobs.user_id", profile.id);
    if (deductionError) fail("Unable to validate deductions. Please try again.");
    checkCombinedRate(parsed.data.taxRateBasisPoints, (deductions ?? []).map((item) => ({ name: item.name, rateBasisPoints: item.rate_basis_points })));
    // Renaming is safe: shifts reference the job by id, and each one carries its
    // own pay snapshot, so nothing historical moves.
    const { error } = await supabase.from("jobs").update({ name: parsed.data.name, color: parsed.data.color, weekly_limit_minutes: parsed.data.weeklyLimitMinutes ?? null, hourly_rate_cents: parsed.data.hourlyRateCents, tax_rate_basis_points: parsed.data.taxRateBasisPoints, ...schedule }).eq("id", id).eq("user_id", profile.id);
    if (error) fail("Unable to update job details. Please try again.");
  });
  if (problem) return { message: problem };
  revalidatePath("/"); revalidatePath("/jobs"); revalidatePath(`/jobs/${id}`); redirect(`/jobs/${id}?saved=job-updated`);
}

export async function addJobDeduction(_previousState: FormActionState, formData: FormData): Promise<FormActionState> {
  const profile = await requireUser();
  let jobId = "";
  const problem = await attempt(async () => {
    const rateBasisPoints = basisPoints(formData.get("rate"), "deduction rate");
    const parsed = deductionSchema.safeParse({ jobId: formData.get("jobId"), name: formData.get("name"), rateBasisPoints });
    if (!parsed.success) fail(parsed.error.issues[0]?.message ?? "Invalid deduction.");
    const supabase = await createServerSupabaseClient();
    const { data: job, error: jobError } = await supabase.from("jobs").select("tax_rate_basis_points,job_deductions(name,rate_basis_points)").eq("id", parsed.data.jobId).eq("user_id", profile.id).single();
    if (jobError || !job) fail("Job not found.");
    checkCombinedRate(job.tax_rate_basis_points, [...(job.job_deductions ?? []).map((item) => ({ name: item.name, rateBasisPoints: item.rate_basis_points })), { name: parsed.data.name, rateBasisPoints: parsed.data.rateBasisPoints }]);
    const { error } = await supabase.from("job_deductions").insert({ job_id: parsed.data.jobId, name: parsed.data.name, rate_basis_points: parsed.data.rateBasisPoints });
    if (error) fail("Unable to add the deduction. Please try again.");
    jobId = parsed.data.jobId;
  });
  if (problem) return { message: problem };
  revalidatePath("/jobs"); revalidatePath(`/jobs/${jobId}`); redirect(`/jobs/${jobId}?saved=deduction-added`);
}

/**
 * The one mutation in this file with no `user_id` column to filter on --
 * `job_deductions` is owned through its parent job. The RLS policy already scopes
 * a delete to deductions on the caller's own jobs, so this resolves the id
 * through that join first rather than trusting the policy to be the only check:
 * every other action here carries its own predicate, and a deduction is the one
 * row whose ownership is indirect. It also turns a blocked cross-account delete
 * into "could not be found" instead of the cheerful "deduction removed" that a
 * zero-row delete reports.
 */
export async function deleteJobDeduction(formData: FormData) {
  const profile = await requireUser();
  const id = resourceId(formData);
  const supabase = await createServerSupabaseClient();
  const { data: owned, error: lookupError } = await supabase.from("job_deductions").select("id,job_id,jobs!inner(user_id)").eq("id", id).eq("jobs.user_id", profile.id).maybeSingle();
  if (lookupError || !owned) fail("This deduction could not be found.");
  const { error } = await supabase.from("job_deductions").delete().eq("id", owned.id);
  if (error) fail("Unable to delete the deduction. Please try again.");
  revalidatePath("/jobs"); revalidatePath(`/jobs/${owned.job_id}`); redirect(`/jobs/${owned.job_id}?saved=deduction-removed`);
}

export async function archiveJob(formData: FormData) { const profile = await requireUser(); const id = resourceId(formData); const supabase = await createServerSupabaseClient(); const { error } = await supabase.from("jobs").update({ archived_at: new Date().toISOString() }).eq("id", id).eq("user_id", profile.id); if (error) fail("Unable to archive the job. Please try again."); revalidatePath("/"); revalidatePath("/jobs"); revalidatePath(`/jobs/${id}`); redirect("/jobs?saved=job-archived"); }

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
  revalidatePath("/"); revalidatePath("/jobs"); redirect("/jobs?saved=job-deleted");
}

export async function unarchiveJob(formData: FormData) { const profile = await requireUser(); const id = resourceId(formData); const supabase = await createServerSupabaseClient(); const { error } = await supabase.from("jobs").update({ archived_at: null }).eq("id", id).eq("user_id", profile.id); if (error) fail("Unable to restore the job. Please try again."); revalidatePath("/"); revalidatePath("/jobs"); revalidatePath(`/jobs/${id}`); redirect("/jobs?saved=job-restored"); }

export async function updateSettings(_previousState: FormActionState, formData: FormData): Promise<FormActionState> {
  const profile = await requireUser();
  const problem = await attempt(async () => {
    const limitHours = String(formData.get("globalWeeklyLimitHours") ?? "");
    const limitMinutes = limitHours ? Math.round(Number(limitHours) * 60) : null;
    const parsed = profileSettingsSchema.safeParse({ displayName: formData.get("displayName"), timeZone: formData.get("timeZone"), weekStartsOn: formData.get("weekStartsOn"), globalWeeklyLimitMinutes: limitMinutes });
    if (!parsed.success) fail(parsed.error.issues[0]?.message ?? "Invalid settings.");
    const supabase = await createServerSupabaseClient();
    const { error } = await supabase.from("profiles").update({ display_name: parsed.data.displayName || null, time_zone: parsed.data.timeZone, week_starts_on: parsed.data.weekStartsOn, global_weekly_limit_minutes: parsed.data.globalWeeklyLimitMinutes ?? null }).eq("id", profile.id);
    if (error) fail("Unable to update settings. Please try again.");
  });
  if (problem) return { message: problem };
  revalidatePath("/"); revalidatePath("/settings"); redirect("/settings?saved=1");
}

/** Notes are the one thing edited here on a shift that comes from Google Calendar. */
export async function updateShiftNotes(formData: FormData) {
  const profile = await requireUser();
  const id = resourceId(formData);
  const notes = String(formData.get("notes") ?? "").trim().slice(0, 500) || null;
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.from("shifts").update({ notes }).eq("id", id).eq("user_id", profile.id);
  if (error) fail("Unable to save the notes. Please try again.");
  revalidatePath("/shifts"); revalidatePath(`/shifts/${id}/edit`); revalidatePath("/calendar");
  redirect("/shifts?saved=shift-notes");
}

/**
 * Saves, replaces or (when emptied) removes the note on one week of the shift
 * log. It answers with state instead of redirecting, so the week the viewer is
 * writing in stays open where it was. A week's start depends on the profile,
 * which the table cannot check, so it is checked here. `legacyId` is a note
 * saved under an earlier week-start day (week-notes.ts): saving moves it onto
 * this week's key by writing the new row and deleting the old one.
 */
export async function saveWeekNote(_previous: SavedFormState, formData: FormData): Promise<SavedFormState> {
  const profile = await requireUser();
  const parsed = weekNoteSchema.safeParse({ weekStart: formData.get("weekStart"), body: formData.get("body"), legacyId: formData.get("legacyId") });
  if (!parsed.success) return { message: parsed.error.issues[0]?.message ?? "Check the note and try again.", savedAt: null };
  const { weekStart, body, legacyId } = parsed.data;
  if (!isWeekStart(weekStart, profile.week_starts_on)) return { message: "That week could not be found. Refresh the page and try again.", savedAt: null };

  const supabase = await createServerSupabaseClient();
  const { error } = body
    ? await supabase.from("week_notes").upsert({ user_id: profile.id, week_start: weekStart, body }, { onConflict: "user_id,week_start" })
    : await supabase.from("week_notes").delete().eq("user_id", profile.id).eq("week_start", weekStart);
  if (error) return { message: "Couldn't save the note. Try again.", savedAt: null };
  // Best effort: if this fails the old row stays, and the exact key now hides it.
  if (legacyId) await supabase.from("week_notes").delete().eq("id", legacyId).eq("user_id", profile.id);
  revalidatePath("/shifts");
  return { message: "", savedAt: Date.now() };
}

/**
 * Puts a synced shift's event on its job's ignore list, so sync will not add
 * it again. True when there was nothing to remember or it was remembered.
 */
async function forgetGoogleEvent(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, userId: string, shiftId: string) {
  const { data: linked } = await supabase.from("shifts").select("job_id,google_calendar_id,google_event_id,jobs(google_sync_ignored)").eq("id", shiftId).eq("user_id", userId).maybeSingle();
  if (!linked?.google_calendar_id || !linked.google_event_id) return true;
  const ignored = withEventIgnored(linked.jobs?.google_sync_ignored ?? [], linked.google_calendar_id, linked.google_event_id);
  const { error } = await supabase.from("jobs").update({ google_sync_ignored: ignored }).eq("id", linked.job_id).eq("user_id", userId);
  return !error;
}

/**
 * Stops a repeating Google event syncing into its job: the series goes on the
 * job's ignore list, and its other upcoming shifts go with it. Deleting one
 * occurrence only ever ignored that occurrence, so a weekly event kept coming
 * back as sync's eight-week window reached each new week. Occurrences that have
 * started are history and stay; a hand-typed shift that sync adopted is only
 * unlinked, never deleted. The shift itself is deleted by the caller.
 */
async function stopGoogleSeries(supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>, userId: string, shiftId: string) {
  const { data: linked } = await supabase.from("shifts").select("job_id,google_calendar_id,google_event_id,jobs(google_sync_ignored)").eq("id", shiftId).eq("user_id", userId).maybeSingle();
  if (!linked?.google_calendar_id || !linked.google_event_id) return true;
  const seriesId = seriesIdOf({ id: linked.google_event_id });
  if (!seriesId) return forgetGoogleEvent(supabase, userId, shiftId);

  const ignored = withSeriesIgnored(linked.jobs?.google_sync_ignored ?? [], linked.google_calendar_id, seriesId);
  const { error } = await supabase.from("jobs").update({ google_sync_ignored: ignored }).eq("id", linked.job_id).eq("user_id", userId);
  if (error) return false;

  const { data: upcoming, error: listError } = await supabase.from("shifts").select("id,google_event_id,google_adopted").eq("user_id", userId).eq("job_id", linked.job_id).neq("id", shiftId).not("google_event_id", "is", null).gt("starts_at", new Date().toISOString());
  if (listError) return false;
  const siblings = (upcoming ?? []).filter((row) => row.google_event_id && seriesIdOf({ id: row.google_event_id }) === seriesId);
  const removeIds = siblings.filter((row) => !row.google_adopted).map((row) => row.id);
  const unlinkIds = siblings.filter((row) => row.google_adopted).map((row) => row.id);
  if (removeIds.length && (await supabase.from("shifts").delete().in("id", removeIds).eq("user_id", userId)).error) return false;
  if (unlinkIds.length && (await supabase.from("shifts").update(UNLINKED_SHIFT).in("id", unlinkIds).eq("user_id", userId)).error) return false;
  return true;
}

/**
 * Stops one synced shift following Google, so it can be corrected here -- the
 * only way to fix a shift already worked, since sync never moves one. Its
 * event is remembered so sync does not add it again as a second shift.
 */
export async function stopFollowingGoogle(formData: FormData) {
  const profile = await requireUser();
  const id = resourceId(formData);
  const supabase = await createServerSupabaseClient();
  if (!(await forgetGoogleEvent(supabase, profile.id, id))) fail("Unable to update the shift. Please try again.");
  const { error } = await supabase.from("shifts").update(UNLINKED_SHIFT).eq("id", id).eq("user_id", profile.id);
  if (error) fail("Unable to update the shift. Please try again.");
  revalidatePath("/shifts"); revalidatePath("/calendar");
  redirect(`/shifts/${id}/edit`);
}
