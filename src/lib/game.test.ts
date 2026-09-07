import assert from "node:assert/strict";
import test from "node:test";
import {
  DEFAULT_GAME_SETTINGS,
  GAME_CODE_ALPHABET,
  IMPOSTER_HINTS,
  IMPOSTER_HINT_LABELS,
  canHideRoles,
  gameSettingsEqual,
  isImposterHint,
  maxImpostersFor,
  normalizeGameCode,
  reconcileGameSettings,
  startBlocker,
  type GameSettings,
} from "./game";

test("forgives case and the separators people type into a code", () => {
  assert.equal(normalizeGameCode("abc234"), "ABC234");
  assert.equal(normalizeGameCode("ABC-234"), "ABC234");
  assert.equal(normalizeGameCode("  abc 234 "), "ABC234");
});

test("rejects a code containing an excluded character rather than stripping it", () => {
  // The whole point of dropping I, L, O, U, 0 and 1 is that they get mistyped.
  // Stripping the bad character would leave five valid characters, fail the
  // length check, and report the wrong problem -- but a seven-character input
  // would silently become a valid code for somebody else's room.
  assert.equal(normalizeGameCode("ABCDOEF"), null);
  assert.equal(normalizeGameCode("ABC0EF"), null);
  assert.equal(normalizeGameCode("ABC1EF"), null);
  assert.equal(normalizeGameCode("ABCIEF"), null);
});

test("rejects codes of the wrong length", () => {
  assert.equal(normalizeGameCode("ABC23"), null);
  assert.equal(normalizeGameCode("ABC2345"), null);
  assert.equal(normalizeGameCode(""), null);
});

test("the code alphabet excludes every character pair that gets misread", () => {
  for (const excluded of ["I", "L", "O", "U", "0", "1"]) {
    assert.equal(GAME_CODE_ALPHABET.includes(excluded), false, `${excluded} should not be in the alphabet`);
  }
  assert.equal(GAME_CODE_ALPHABET.length, 30);
});

test("caps imposters two short of the head count", () => {
  assert.equal(maxImpostersFor(3), 1);
  assert.equal(maxImpostersFor(4), 2);
  assert.equal(maxImpostersFor(5), 3);
  assert.equal(maxImpostersFor(20), 3, "never above the settings bound");
  assert.equal(maxImpostersFor(1), 1, "never below one, even at an impossible head count");
});

test("blocks a start below the minimum player count", () => {
  assert.equal(startBlocker(1, 1)?.reason, "not-enough-players");
  assert.equal(startBlocker(2, 1)?.reason, "not-enough-players");
  assert.equal(startBlocker(3, 1), null);
});

test("blocks a start where the imposters would outnumber the game", () => {
  assert.equal(startBlocker(3, 2)?.reason, "too-many-imposters");
  assert.equal(startBlocker(4, 2), null);
  assert.equal(startBlocker(4, 3)?.reason, "too-many-imposters");
  assert.equal(startBlocker(5, 3), null);
});

test("counts players in the not-enough-players message", () => {
  assert.match(startBlocker(1, 1)!.message, /2 more players/);
  assert.match(startBlocker(2, 1)!.message, /1 more player\b/);
});

test("hidden roles are only possible when the imposter holds a decoy", () => {
  assert.equal(canHideRoles("DECOY"), true);
  for (const hint of ["NONE", "CATEGORY", "RELATED"] as const) {
    assert.equal(canHideRoles(hint), false, `${hint} has no word to hide behind`);
  }
});

test("turning the hint down switches hidden roles back off", () => {
  const hidden: GameSettings = { ...DEFAULT_GAME_SETTINGS, imposterHint: "DECOY", hideRoles: true };
  assert.equal(reconcileGameSettings(hidden).hideRoles, true);

  // Changing only the hint must not leave an impossible pairing behind -- the
  // database rejects it, and the form would be refused for a field the host
  // never touched.
  const downgraded = reconcileGameSettings({ ...hidden, imposterHint: "CATEGORY" });
  assert.equal(downgraded.hideRoles, false);
  assert.equal(downgraded.imposterHint, "CATEGORY");
});

test("settings comparison notices every field", () => {
  const base = DEFAULT_GAME_SETTINGS;
  assert.equal(gameSettingsEqual(base, { ...base }), true);

  const changes: Partial<GameSettings>[] = [
    { imposterHint: "DECOY" },
    { imposterFinalGuess: false },
    { imposterCount: 2 },
    { cluePasses: 3 },
    { maxPlayers: 5 },
    { banRepeatClues: false },
    { discussionPhase: true },
    { wordDifficulty: "EASY" },
    { categoryFilter: "Animals" },
  ];

  for (const change of changes) {
    const key = Object.keys(change)[0];
    assert.equal(gameSettingsEqual(base, { ...base, ...change }), false, `${key} was treated as unchanged`);
  }

  // hideRoles needs the decoy alongside it to be a legal difference at all.
  const hidden: GameSettings = { ...base, imposterHint: "DECOY", hideRoles: true };
  assert.equal(gameSettingsEqual({ ...base, imposterHint: "DECOY" }, hidden), false);
});

test("every hint rung has copy to render", () => {
  for (const hint of IMPOSTER_HINTS) {
    assert.ok(IMPOSTER_HINT_LABELS[hint].label.length > 0, `${hint} has no label`);
    assert.ok(IMPOSTER_HINT_LABELS[hint].description.length > 0, `${hint} has no description`);
  }
});

test("isImposterHint rejects anything that is not a rung", () => {
  assert.equal(isImposterHint("DECOY"), true);
  assert.equal(isImposterHint("decoy"), false);
  assert.equal(isImposterHint("SOMETHING_ELSE"), false);
  assert.equal(isImposterHint(null), false);
  assert.equal(isImposterHint(undefined), false);
});
