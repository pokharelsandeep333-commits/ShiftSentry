import { createLocalPreference } from "@/lib/local-preference";
import {
  DEFAULT_GAME_SETTINGS,
  GAME_SETTINGS_BOUNDS,
  isImposterHint,
  isWordDifficulty,
  reconcileGameSettings,
  type GameSettings,
} from "@/lib/game";

/**
 * The settings you last hosted with, remembered on this device.
 *
 * A room's settings live in the database and belong to that room. This is the
 * separate thing: what *you* like, so the next game you host starts where the
 * last one left off instead of back at the defaults. It is per-viewer and
 * per-device by nature, which is exactly what `createLocalPreference` is for --
 * and per `CLAUDE.md` it is the only sanctioned path to a remembered client
 * setting.
 *
 * Written when a host saves settings, read when the settings panel first mounts
 * on a room still using the untouched defaults. A room that has already been
 * configured is never overwritten by it: the room is the source of truth once
 * somebody has made a decision about it.
 */

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isInteger(value) && value >= min && value <= max ? value : fallback;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

export const gameSettingsPreference = createLocalPreference<GameSettings>(
  "shiftsentry:game-settings",
  DEFAULT_GAME_SETTINGS,
  (parsed) => {
    if (typeof parsed !== "object" || parsed === null) return null;
    const stored = parsed as Record<string, unknown>;

    // Field by field rather than a cast. These values outlive deploys, so an
    // entry written by an older build -- back when this held `decoyMode` and
    // `categoryHint` booleans -- has to degrade into today's shape rather than
    // reach the form as something the database will reject.
    const settings: GameSettings = {
      imposterHint: isImposterHint(stored.imposterHint) ? stored.imposterHint : DEFAULT_GAME_SETTINGS.imposterHint,
      hideRoles: bool(stored.hideRoles, DEFAULT_GAME_SETTINGS.hideRoles),
      imposterFinalGuess: bool(stored.imposterFinalGuess, DEFAULT_GAME_SETTINGS.imposterFinalGuess),
      imposterCount: clamp(
        stored.imposterCount,
        GAME_SETTINGS_BOUNDS.imposterCount.min,
        GAME_SETTINGS_BOUNDS.imposterCount.max,
        DEFAULT_GAME_SETTINGS.imposterCount,
      ),
      cluePasses: clamp(
        stored.cluePasses,
        GAME_SETTINGS_BOUNDS.cluePasses.min,
        GAME_SETTINGS_BOUNDS.cluePasses.max,
        DEFAULT_GAME_SETTINGS.cluePasses,
      ),
      maxPlayers: clamp(
        stored.maxPlayers,
        GAME_SETTINGS_BOUNDS.maxPlayers.min,
        GAME_SETTINGS_BOUNDS.maxPlayers.max,
        DEFAULT_GAME_SETTINGS.maxPlayers,
      ),
      banRepeatClues: bool(stored.banRepeatClues, DEFAULT_GAME_SETTINGS.banRepeatClues),
      discussionPhase: bool(stored.discussionPhase, DEFAULT_GAME_SETTINGS.discussionPhase),
      wordDifficulty: isWordDifficulty(stored.wordDifficulty) ? stored.wordDifficulty : DEFAULT_GAME_SETTINGS.wordDifficulty,
      categoryFilter: typeof stored.categoryFilter === "string" && stored.categoryFilter.trim() !== ""
        ? stored.categoryFilter
        : null,
    };

    // A stored pairing the database would refuse -- hidden roles without a decoy
    // -- is repaired rather than rejected, so an old entry costs you one setting
    // instead of all of them.
    return reconcileGameSettings(settings);
  },
);
