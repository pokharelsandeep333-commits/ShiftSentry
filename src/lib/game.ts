/**
 * Pure helpers for the imposter game: the invite-code alphabet, the settings
 * bounds, and the arithmetic the lobby needs to say whether a round can start.
 *
 * Deliberately free of any Supabase import so it stays runnable under
 * `tsx --test`. Anything that reaches the database lives in `game-lobby.ts`.
 *
 * Every bound here has a counterpart check constraint in
 * `20260907120000_imposter_game_foundation.sql`. The database is the authority;
 * these exist so the form can refuse a bad value with a sentence a person can
 * act on, rather than surfacing a constraint violation.
 */

/**
 * No I, L, O, U, 0 or 1.
 *
 * The pairs that actually get misread are I/1/l and O/0, and a code is read
 * aloud across a room or retyped off someone's screenshot far more often than
 * it is copied. Dropping both sides of each pair costs two characters of
 * alphabet -- 30^6 is still about 729 million -- and removes the whole class of
 * "I typed what you said and it didn't work".
 *
 * Q is kept even though it can be misread as O, because O is not in the
 * alphabet: there is nothing for it to be confused *with*.
 */
export const GAME_CODE_ALPHABET = "ABCDEFGHJKMNPQRSTVWXYZ23456789";
export const GAME_CODE_LENGTH = 6;

const GAME_CODE_PATTERN = new RegExp(`^[${GAME_CODE_ALPHABET}]{${GAME_CODE_LENGTH}}$`);

/**
 * Turn what someone typed into a code, or null if it cannot be one.
 *
 * Case and the separators people add themselves ("abc-def", "ABC DEF") are
 * forgiven, because they carry no information. A character outside the alphabet
 * is not: silently dropping it would turn "ABCDOEF" into the valid but entirely
 * different code "ABCDEF" and drop that player into a stranger's game. Better to
 * reject it and let the form say so.
 */
export function normalizeGameCode(raw: string): string | null {
  const candidate = raw.replace(/[\s-]+/g, "").toUpperCase();
  return GAME_CODE_PATTERN.test(candidate) ? candidate : null;
}

export const GAME_SETTINGS_BOUNDS = {
  imposterCount: { min: 1, max: 3 },
  cluePasses: { min: 1, max: 3 },
  maxPlayers: { min: 3, max: 20 },
} as const;

/** Below this there is no game: one imposter and one other player is just a coin flip. */
export const MIN_PLAYERS_TO_START = 3;

export type GameSettings = {
  decoyMode: boolean;
  categoryHint: boolean;
  imposterFinalGuess: boolean;
  imposterCount: number;
  cluePasses: number;
  maxPlayers: number;
  categoryFilter: string | null;
};

/**
 * How many imposters this many players can support.
 *
 * Two short of the head count, never below one: a round where everyone but one
 * player is an imposter has nobody left to deceive, and at `playerCount - 1` the
 * single crew member is outvoted by definition. The lobby uses this to cap the
 * picker; the deal function re-checks it, because the roster can shrink between
 * the host choosing 3 and the round actually starting.
 */
export function maxImpostersFor(playerCount: number): number {
  return Math.min(GAME_SETTINGS_BOUNDS.imposterCount.max, Math.max(1, playerCount - 2));
}

export type StartBlocker = { reason: "not-enough-players" | "too-many-imposters"; message: string };

/**
 * Why this room cannot deal a round yet, or null when it can.
 *
 * Returned rather than thrown so the lobby can render it as guidance next to a
 * disabled button, before anyone tries.
 */
export function startBlocker(playerCount: number, imposterCount: number): StartBlocker | null {
  if (playerCount < MIN_PLAYERS_TO_START) {
    const missing = MIN_PLAYERS_TO_START - playerCount;
    return {
      reason: "not-enough-players",
      message: `Waiting for ${missing} more player${missing === 1 ? "" : "s"}. A round needs at least ${MIN_PLAYERS_TO_START}.`,
    };
  }

  if (imposterCount > maxImpostersFor(playerCount)) {
    return {
      reason: "too-many-imposters",
      message: `${imposterCount} imposters needs at least ${imposterCount + 2} players. Lower the count or wait for more people.`,
    };
  }

  return null;
}

/** One line describing how a room is configured, for the lobby header and the roster card. */
export function describeGameSettings(settings: GameSettings): string {
  return [
    `${settings.imposterCount} imposter${settings.imposterCount === 1 ? "" : "s"}`,
    settings.decoyMode ? "decoy word" : "no decoy",
    settings.categoryHint ? "category shown" : "category hidden",
    `${settings.cluePasses} clue pass${settings.cluePasses === 1 ? "" : "es"}`,
    settings.categoryFilter ?? "all categories",
  ].join(" · ");
}
