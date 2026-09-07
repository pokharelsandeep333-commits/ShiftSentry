import { z } from "zod";
import { GAME_SETTINGS_BOUNDS, IMPOSTER_HINTS, normalizeGameCode } from "@/lib/game";

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

/**
 * An invite code as typed. Validated before it reaches the database rather than
 * after, so a mistyped character is answered by the form instead of by
 * `join_game_room` reporting that no such game exists -- which is true but reads
 * as "the game is gone" when the real problem is a typo.
 */
export const gameCodeSchema = z.string()
  .trim()
  .refine((value) => normalizeGameCode(value) !== null, "A game code is six characters, like 7KQ2MP.")
  .transform((value) => normalizeGameCode(value) as string);

/** Blank is allowed: the database falls back to the profile name, then the email handle. */
export const gameDisplayNameSchema = z.string().trim().max(40, "Keep it under 40 characters.").optional();

export const gameRoomSettingsSchema = z.object({
  roomId: z.string().uuid(),
  imposterHint: z.enum(IMPOSTER_HINTS),
  hideRoles: z.boolean(),
  imposterFinalGuess: z.boolean(),
  imposterCount: z.coerce.number().int()
    .min(GAME_SETTINGS_BOUNDS.imposterCount.min)
    .max(GAME_SETTINGS_BOUNDS.imposterCount.max),
  cluePasses: z.coerce.number().int()
    .min(GAME_SETTINGS_BOUNDS.cluePasses.min)
    .max(GAME_SETTINGS_BOUNDS.cluePasses.max),
  maxPlayers: z.coerce.number().int()
    .min(GAME_SETTINGS_BOUNDS.maxPlayers.min)
    .max(GAME_SETTINGS_BOUNDS.maxPlayers.max),
  banRepeatClues: z.boolean(),
  discussionPhase: z.boolean(),
  categoryFilter: z.string().trim().min(2).max(40).nullable(),
}).refine((settings) => !settings.hideRoles || settings.imposterHint === "DECOY", {
  // Mirrors game_rooms_hide_roles_needs_decoy. The form keeps the two in step as
  // you change them, so reaching this means the request did not come from it.
  message: "Roles can only be hidden when the imposter gets a decoy word.",
  path: ["hideRoles"],
});

/**
 * A clue is deliberately short. The game is one word each; a cap of 40 leaves
 * room for "smells like autumn" without letting anyone paste a paragraph that
 * describes the answer outright.
 */
export const gameClueSchema = z.string().trim()
  .min(1, "Enter a clue.")
  .max(40, "Keep your clue under 40 characters.");

export const gameGuessSchema = z.string().trim()
  .min(1, "Enter the word you think it was.")
  .max(40, "That is longer than any word in the game.");
