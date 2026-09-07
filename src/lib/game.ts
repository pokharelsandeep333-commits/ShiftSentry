/**
 * Pure helpers for the imposter game: the invite-code alphabet, the settings
 * bounds, and the arithmetic the lobby needs to say whether a round can start.
 *
 * Deliberately free of any Supabase import so it stays runnable under
 * `tsx --test`. Anything that reaches the database lives in `game-lobby.ts` and
 * `game-round.ts`; anything that reaches `localStorage` lives in
 * `game-preferences.ts`.
 *
 * Every bound here has a counterpart check constraint in the migrations. The
 * database is the authority; these exist so the form can refuse a bad value with
 * a sentence a person can act on, rather than surfacing a constraint violation.
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

/**
 * How much help the imposter gets, as one scale rather than two switches.
 *
 * The rungs are ordered by how much they give away, and only the last hands over
 * a word. That distinction is load-bearing: see `canHideRoles`.
 */
export const IMPOSTER_HINTS = ["NONE", "CATEGORY", "RELATED", "DECOY"] as const;
export type ImposterHint = (typeof IMPOSTER_HINTS)[number];

export const IMPOSTER_HINT_LABELS: Record<ImposterHint, { label: string; description: string }> = {
  NONE: {
    label: "Nothing",
    description: "The imposter is told only that they're the imposter. Hardest, and the most fun to watch.",
  },
  CATEGORY: {
    label: "The category",
    description: "They see “Food & Drink” but not the word. Enough to avoid saying something absurd.",
  },
  RELATED: {
    label: "A related word",
    description: "Another word from the same category — points at the right area without being nearly-right.",
  },
  DECOY: {
    label: "A decoy word",
    description: "A similar-but-wrong word, so they can bluff naturally. Required for hidden roles.",
  },
};

export function isImposterHint(value: unknown): value is ImposterHint {
  return typeof value === "string" && (IMPOSTER_HINTS as readonly string[]).includes(value);
}

/**
 * Roles can only be hidden when the imposter is holding a decoy.
 *
 * On every lower rung the empty word card *is* the tell -- a player who is given
 * nothing knows exactly what they are, and no amount of not-saying-it in the UI
 * changes that. Hiding roles is only meaningful when everybody is holding a
 * word, which is also the version of the game where working out that yours is
 * the odd one is the whole point. The database enforces the same pairing.
 */
export function canHideRoles(hint: ImposterHint): boolean {
  return hint === "DECOY";
}

export const GAME_SETTINGS_BOUNDS = {
  imposterCount: { min: 1, max: 3 },
  cluePasses: { min: 1, max: 3 },
  maxPlayers: { min: 3, max: 20 },
} as const;

/** Below this there is no game: one imposter and one other player is just a coin flip. */
export const MIN_PLAYERS_TO_START = 3;

export type GameSettings = {
  imposterHint: ImposterHint;
  hideRoles: boolean;
  imposterFinalGuess: boolean;
  imposterCount: number;
  cluePasses: number;
  maxPlayers: number;
  banRepeatClues: boolean;
  discussionPhase: boolean;
  categoryFilter: string | null;
};

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  imposterHint: "NONE",
  hideRoles: false,
  imposterFinalGuess: true,
  imposterCount: 1,
  cluePasses: 1,
  maxPlayers: 12,
  banRepeatClues: true,
  discussionPhase: false,
  categoryFilter: null,
};

/**
 * Force a settings object into a state the database would accept.
 *
 * The one rule that cannot be expressed by clamping a number: turning the hint
 * down off DECOY has to switch hidden roles back off, or the save is rejected
 * for a reason the person did not touch. Applied on every change rather than at
 * submit, so the switch visibly goes off at the moment it stops being possible.
 */
export function reconcileGameSettings(settings: GameSettings): GameSettings {
  return { ...settings, hideRoles: settings.hideRoles && canHideRoles(settings.imposterHint) };
}

export function gameSettingsEqual(left: GameSettings, right: GameSettings): boolean {
  return (
    left.imposterHint === right.imposterHint
    && left.hideRoles === right.hideRoles
    && left.imposterFinalGuess === right.imposterFinalGuess
    && left.imposterCount === right.imposterCount
    && left.cluePasses === right.cluePasses
    && left.maxPlayers === right.maxPlayers
    && left.banRepeatClues === right.banRepeatClues
    && left.discussionPhase === right.discussionPhase
    && left.categoryFilter === right.categoryFilter
  );
}

/**
 * How many imposters this many players can support.
 *
 * Two short of the head count, never below one: a round where everyone but one
 * player is an imposter has nobody left to deceive, and at `playerCount - 1` the
 * single crew member is outvoted by definition. The lobby uses this to explain
 * itself; the deal function re-checks it, because the roster can shrink between
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

/** One line describing how a room is configured, for the lobby header. */
export function describeGameSettings(settings: GameSettings): string {
  return [
    `${settings.imposterCount} imposter${settings.imposterCount === 1 ? "" : "s"}`,
    settings.hideRoles ? "roles hidden" : IMPOSTER_HINT_LABELS[settings.imposterHint].label.toLowerCase(),
    `${settings.cluePasses} clue pass${settings.cluePasses === 1 ? "" : "es"}`,
    settings.discussionPhase ? "discussion" : "straight to the vote",
    settings.categoryFilter ?? "all categories",
  ].join(" · ");
}
