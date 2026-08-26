import { z } from "zod";

export const resourceIdSchema = z.string().uuid("Invalid resource identifier.");

export const weekStartsOnSchema = z.coerce.number().int().min(0).max(6);

export const profileSettingsSchema = z.object({
  displayName: z.string().trim().max(100).optional().or(z.literal("")),
  timeZone: z.string().trim().min(1).max(100).refine((value) => {
    try { Intl.DateTimeFormat(undefined, { timeZone: value }); return true; } catch { return false; }
  }, "Choose a valid IANA time zone."),
  weekStartsOn: weekStartsOnSchema,
  globalWeeklyLimitMinutes: z.coerce.number().int().min(1).max(10_080).nullable().optional(),
});

export const jobSchema = z.object({
  name: z.string().trim().min(1, "Job name is required.").max(80),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/, "Use a six-character hex color."),
  weeklyLimitMinutes: z.coerce.number().int().min(1).max(10_080).nullable().optional(),
  hourlyRateCents: z.coerce.number().int().min(0).max(1_000_000),
  taxRateBasisPoints: z.coerce.number().int().min(0).max(10_000),
});

export const deductionSchema = z.object({
  jobId: z.string().uuid(),
  name: z.string().trim().min(1, "Deduction name is required.").max(80),
  rateBasisPoints: z.coerce.number().int().min(1).max(10_000),
});

export const shiftSchema = z.object({
  jobId: z.string().uuid(),
  startsAt: z.coerce.date(),
  endsAt: z.coerce.date(),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
}).refine((shift) => shift.endsAt > shift.startsAt, {
  message: "End time must be after start time.",
  path: ["endsAt"],
}).refine((shift) => shift.endsAt.getTime() - shift.startsAt.getTime() <= 24 * 60 * 60 * 1000, {
  message: "A shift cannot exceed 24 hours.",
  path: ["endsAt"],
});
