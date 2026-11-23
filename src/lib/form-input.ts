import { parseMoneyToCents, parsePercentToBasisPoints } from "@/lib/earnings";
import type { FieldErrors } from "@/lib/form-state";
import { deductionSchema, jobSchema, payScheduleFormSchema, profileSettingsSchema } from "@/lib/validation";

/**
 * Reading the job and settings forms into validated values, with every problem
 * filed under the input that caused it.
 *
 * These used to live in the actions as helpers that threw, so the first bad
 * field stopped the parse and its message went to the bottom of the form. They
 * are plain functions here so `validation.test.ts` can pin which input each
 * message lands on. The rules and messages are the ones the actions always
 * had; only where the messages go has changed. The database still enforces the
 * same rules on its own (see `supabase/CLAUDE.md`).
 */

export type FormRead<T> = { ok: true; data: T } | { ok: false; message: string; fieldErrors: FieldErrors };

type Issue = { path: readonly PropertyKey[]; message: string };

/**
 * Files schema issues under the form's input names. `names` maps a schema key
 * to its input (`hourlyRateCents` → `hourlyRate`). A field keeps its first
 * message, including one set before the schema ran. An issue on a key outside
 * `names` belongs to no field: the first of those is returned as the message.
 */
export function fileIssues(issues: readonly Issue[], names: Record<string, string>, fieldErrors: FieldErrors): string {
  let message = "";
  for (const issue of issues) {
    const key = issue.path[0];
    const field = typeof key === "string" ? names[key] : undefined;
    if (field) fieldErrors[field] ??= issue.message;
    else if (!message) message = issue.message;
  }
  return message;
}

function failed<T>(message: string, fieldErrors: FieldErrors, fallback: string): FormRead<T> {
  return { ok: false, message: message || (Object.keys(fieldErrors).length ? "" : fallback), fieldErrors };
}

/** Hours typed into a weekly limit field, as minutes. Blank is no limit. */
export function readWeeklyLimit(value: FormDataEntryValue | null): { minutes: number | null } | { error: string } {
  const raw = String(value ?? "").trim();
  if (!raw) return { minutes: null };
  const hours = Number(raw);
  if (!Number.isFinite(hours) || hours <= 0 || hours > 168) return { error: "Enter a weekly limit between 1 and 168 hours, or leave it blank for no cap." };
  return { minutes: Math.round(hours * 60) };
}

const JOB_FIELDS = { name: "name", color: "color", weeklyLimitMinutes: "weeklyLimitHours", hourlyRateCents: "hourlyRate", taxRateBasisPoints: "taxRate" };
const PAY_SCHEDULE_FIELDS = { frequency: "payFrequency", anchorDate: "payAnchorDate", monthDay: "payMonthDay", paydayOffsetDays: "paydayOffsetDays" };

type JobInput = {
  name: string;
  color: string;
  weeklyLimitMinutes: number | null;
  hourlyRateCents: number;
  taxRateBasisPoints: number;
  /** The pay schedule as `jobs` columns, ready to spread into an insert or update. */
  schedule: ReturnType<typeof payScheduleFormSchema.parse>;
};

/** The add-job and edit-job form. A form without the pay schedule fields (an older page) means no schedule. */
export function readJobForm(formData: FormData): FormRead<JobInput> {
  const fieldErrors: FieldErrors = {};
  const limit = readWeeklyLimit(formData.get("weeklyLimitHours"));
  if ("error" in limit) fieldErrors.weeklyLimitHours = limit.error;
  const hourlyRateCents = parseMoneyToCents(String(formData.get("hourlyRate") ?? ""));
  if (hourlyRateCents === null) fieldErrors.hourlyRate = "Enter a valid hourly rate, such as 18.50.";
  const taxRateBasisPoints = parsePercentToBasisPoints(String(formData.get("taxRate") ?? ""));
  if (taxRateBasisPoints === null) fieldErrors.taxRate = "Enter a valid tax rate between 0% and 100%.";

  // A field that failed above already has its message; the stand-in values
  // only let the schema check the others.
  const job = jobSchema.safeParse({ name: formData.get("name"), color: formData.get("color"), weeklyLimitMinutes: "error" in limit ? null : limit.minutes, hourlyRateCents: hourlyRateCents ?? 0, taxRateBasisPoints: taxRateBasisPoints ?? 0 });
  let message = job.success ? "" : fileIssues(job.error.issues, JOB_FIELDS, fieldErrors);
  const schedule = payScheduleFormSchema.safeParse({ frequency: formData.get("payFrequency") ?? "none", anchorDate: formData.get("payAnchorDate"), monthDay: formData.get("payMonthDay"), paydayOffsetDays: formData.get("paydayOffsetDays") });
  if (!schedule.success) message ||= fileIssues(schedule.error.issues, PAY_SCHEDULE_FIELDS, fieldErrors);

  if (!job.success || !schedule.success || Object.keys(fieldErrors).length) return failed(message, fieldErrors, "Invalid job.");
  return { ok: true, data: { ...job.data, weeklyLimitMinutes: job.data.weeklyLimitMinutes ?? null, schedule: schedule.data } };
}

/** The add-deduction form on a job's page. */
export function readDeductionForm(formData: FormData): FormRead<ReturnType<typeof deductionSchema.parse>> {
  const fieldErrors: FieldErrors = {};
  const rateBasisPoints = parsePercentToBasisPoints(String(formData.get("rate") ?? ""));
  if (rateBasisPoints === null) fieldErrors.rate = "Enter a valid deduction rate between 0% and 100%.";
  const parsed = deductionSchema.safeParse({ jobId: formData.get("jobId"), name: formData.get("name"), rateBasisPoints: rateBasisPoints ?? 0 });
  const message = parsed.success ? "" : fileIssues(parsed.error.issues, { name: "name", rateBasisPoints: "rate" }, fieldErrors);
  if (!parsed.success || Object.keys(fieldErrors).length) return failed(message, fieldErrors, "Invalid deduction.");
  return { ok: true, data: parsed.data };
}

type SettingsInput = ReturnType<typeof profileSettingsSchema.parse>;

/** Profile and week in Settings. */
export function readSettingsForm(formData: FormData): FormRead<SettingsInput> {
  const fieldErrors: FieldErrors = {};
  const limitHours = String(formData.get("globalWeeklyLimitHours") ?? "");
  const limitMinutes = limitHours ? Math.round(Number(limitHours) * 60) : null;
  const parsed = profileSettingsSchema.safeParse({ displayName: formData.get("displayName"), timeZone: formData.get("timeZone"), weekStartsOn: formData.get("weekStartsOn"), globalWeeklyLimitMinutes: limitMinutes });
  if (parsed.success) return { ok: true, data: parsed.data };
  const message = fileIssues(parsed.error.issues, { displayName: "displayName", timeZone: "timeZone", weekStartsOn: "weekStartsOn", globalWeeklyLimitMinutes: "globalWeeklyLimitHours" }, fieldErrors);
  return failed(message, fieldErrors, "Invalid settings.");
}
