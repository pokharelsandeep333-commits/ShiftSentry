"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { gameClueSchema, gameCodeSchema, gameDisplayNameSchema, gameGuessSchema, gameRoomSettingsSchema, resourceIdSchema } from "@/lib/validation";
import type { FormActionState, SavedFormState } from "@/lib/form-state";

/**
 * User-scoped game mutations. Every one of them is a single RPC, because the
 * lobby rules -- capacity, host-only settings, host succession -- are enforced
 * by security definer functions rather than by table grants. There is no
 * `.insert()` or `.update()` in this file, and there should not be one: a write
 * path that bypassed those functions would bypass the rules with it.
 */

type PostgrestErrorish = { code?: string | null; message: string } | null;

/**
 * Decide whether a database error is safe to show.
 *
 * The lobby functions raise messages written for a player to read ("That game
 * is full."), and those are worth showing. A check-constraint violation or a
 * type error is not: it leaks column names and constraint identifiers, and it
 * tells whoever typed the value nothing they can act on.
 *
 * `P0001` is the SQLSTATE Postgres assigns to a bare `raise exception`, so it
 * separates the messages this codebase wrote from the ones Postgres generated,
 * without matching on message text.
 */
function readableError(error: PostgrestErrorish, fallback: string): string {
  if (!error) return fallback;
  return error.code === "P0001" && error.message ? error.message : fallback;
}

function checked(formData: FormData, name: string): boolean {
  return formData.get(name) === "on";
}

function optionalText(formData: FormData, name: string): string | null {
  const value = String(formData.get(name) ?? "").trim();
  return value === "" ? null : value;
}

export async function createGameRoom(_previous: FormActionState, formData: FormData): Promise<FormActionState> {
  await requireUser();

  const displayName = gameDisplayNameSchema.safeParse(formData.get("displayName") ?? undefined);
  if (!displayName.success) return { message: displayName.error.issues[0]?.message ?? "Choose a shorter name." };

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("create_game_room", {
    p_display_name: displayName.data ?? null,
  });

  if (error || !data) return { message: readableError(error, "We couldn't start a game. Please try again.") };

  redirect(`/game/${data}?saved=room-created`);
}

export async function joinGameRoom(_previous: FormActionState, formData: FormData): Promise<FormActionState> {
  await requireUser();

  const code = gameCodeSchema.safeParse(formData.get("code") ?? "");
  if (!code.success) return { message: code.error.issues[0]?.message ?? "Check the code and try again." };

  const displayName = gameDisplayNameSchema.safeParse(formData.get("displayName") ?? undefined);
  if (!displayName.success) return { message: displayName.error.issues[0]?.message ?? "Choose a shorter name." };

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.rpc("join_game_room", {
    p_code: code.data,
    p_display_name: displayName.data ?? null,
  });

  if (error || !data) return { message: readableError(error, "We couldn't join that game. Please try again.") };

  redirect(`/game/${data}?saved=room-joined`);
}

export async function updateGameSettings(_previous: SavedFormState, formData: FormData): Promise<SavedFormState> {
  await requireUser();

  const parsed = gameRoomSettingsSchema.safeParse({
    roomId: formData.get("roomId"),
    imposterHint: formData.get("imposterHint"),
    hideRoles: checked(formData, "hideRoles"),
    imposterFinalGuess: checked(formData, "imposterFinalGuess"),
    imposterCount: formData.get("imposterCount"),
    cluePasses: formData.get("cluePasses"),
    maxPlayers: formData.get("maxPlayers"),
    banRepeatClues: checked(formData, "banRepeatClues"),
    discussionPhase: checked(formData, "discussionPhase"),
    categoryFilter: optionalText(formData, "categoryFilter"),
  });

  if (!parsed.success) {
    return { message: parsed.error.issues[0]?.message ?? "Those settings are not valid.", savedAt: null };
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("update_game_room_settings", {
    p_room_id: parsed.data.roomId,
    p_imposter_hint: parsed.data.imposterHint,
    p_hide_roles: parsed.data.hideRoles,
    p_imposter_final_guess: parsed.data.imposterFinalGuess,
    p_imposter_count: parsed.data.imposterCount,
    p_clue_passes: parsed.data.cluePasses,
    p_max_players: parsed.data.maxPlayers,
    p_ban_repeat_clues: parsed.data.banRepeatClues,
    p_discussion_phase: parsed.data.discussionPhase,
    p_category_filter: parsed.data.categoryFilter,
  });

  if (error) {
    return { message: readableError(error, "We couldn't save those settings. Please try again."), savedAt: null };
  }

  revalidatePath("/game", "layout");
  return { message: "", savedAt: Date.now() };
}

export async function leaveGameRoom(formData: FormData): Promise<void> {
  await requireUser();

  const roomId = resourceIdSchema.safeParse(formData.get("roomId"));
  if (!roomId.success) redirect("/game");

  const supabase = await createServerSupabaseClient();
  await supabase.rpc("leave_game_room", { p_room_id: roomId.data });

  revalidatePath("/game", "layout");
  redirect("/game?saved=room-left");
}

export async function endGameRoom(formData: FormData): Promise<void> {
  await requireUser();

  const roomId = resourceIdSchema.safeParse(formData.get("roomId"));
  if (!roomId.success) redirect("/game");

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("end_game_room", { p_room_id: roomId.data });

  revalidatePath("/game", "layout");
  // Only the host is shown this button and the function re-checks that anyway,
  // so a failure here is close to impossible -- but announcing "Game ended" for
  // a game that is still running would be worse than saying nothing.
  redirect(error ? "/game" : "/game?saved=room-ended");
}

/**
 * Presence heartbeat for the lobby poll.
 *
 * Takes the room id as a plain argument rather than a FormData, because it is
 * called from an interval in a client component and never from a form. It
 * deliberately returns nothing and swallows failures: a dropped heartbeat costs
 * a stale presence dot for one poll, and surfacing it would put an error in
 * front of someone who did nothing wrong.
 */
export async function touchGamePresence(roomId: string): Promise<void> {
  const parsed = resourceIdSchema.safeParse(roomId);
  if (!parsed.success) return;

  const supabase = await createServerSupabaseClient();
  await supabase.rpc("touch_game_presence", { p_room_id: parsed.data });
}

/**
 * The round loop.
 *
 * All five return a FormActionState rather than redirecting, because none of
 * them changes which page you are on -- the round screen is the same URL
 * throughout, and the poll picks up the new phase. What they do need is
 * somewhere to put "It is not your turn yet.", which a redirect would discard.
 */

function roundId(formData: FormData) {
  return resourceIdSchema.safeParse(formData.get("roundId"));
}

export async function startGameRound(_previous: FormActionState, formData: FormData): Promise<FormActionState> {
  await requireUser();

  const room = resourceIdSchema.safeParse(formData.get("roomId"));
  if (!room.success) return { message: "That game is no longer available." };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("start_game_round", { p_room_id: room.data });

  if (error) return { message: readableError(error, "We couldn't start the round. Please try again.") };

  revalidatePath("/game", "layout");
  return { message: "" };
}

export async function submitGameClue(_previous: FormActionState, formData: FormData): Promise<FormActionState> {
  await requireUser();

  const round = roundId(formData);
  if (!round.success) return { message: "That round is no longer available." };

  const clue = gameClueSchema.safeParse(formData.get("clue") ?? "");
  if (!clue.success) return { message: clue.error.issues[0]?.message ?? "Enter a clue." };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("submit_game_clue", { p_round_id: round.data, p_clue: clue.data });

  if (error) return { message: readableError(error, "We couldn't record that clue. Please try again.") };

  revalidatePath("/game", "layout");
  return { message: "" };
}

export async function submitGameVote(_previous: FormActionState, formData: FormData): Promise<FormActionState> {
  await requireUser();

  const round = roundId(formData);
  if (!round.success) return { message: "That round is no longer available." };

  const target = resourceIdSchema.safeParse(formData.get("targetId"));
  if (!target.success) return { message: "Pick a player to vote for." };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("submit_game_vote", { p_round_id: round.data, p_target_id: target.data });

  if (error) return { message: readableError(error, "We couldn't record that vote. Please try again.") };

  revalidatePath("/game", "layout");
  return { message: "" };
}

export async function submitGameFinalGuess(_previous: FormActionState, formData: FormData): Promise<FormActionState> {
  await requireUser();

  const round = roundId(formData);
  if (!round.success) return { message: "That round is no longer available." };

  const guess = gameGuessSchema.safeParse(formData.get("guess") ?? "");
  if (!guess.success) return { message: guess.error.issues[0]?.message ?? "Enter your guess." };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("submit_game_final_guess", { p_round_id: round.data, p_guess: guess.data });

  if (error) return { message: readableError(error, "We couldn't record that guess. Please try again.") };

  revalidatePath("/game", "layout");
  return { message: "" };
}

export async function finishGameRound(_previous: FormActionState, formData: FormData): Promise<FormActionState> {
  await requireUser();

  const round = roundId(formData);
  if (!round.success) return { message: "That round is no longer available." };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("finish_game_round", { p_round_id: round.data });

  if (error) return { message: readableError(error, "We couldn't close the round. Please try again.") };

  revalidatePath("/game", "layout");
  return { message: "" };
}

/**
 * Host controls. Each is a single RPC that re-checks host-ness itself, so the
 * only thing this layer adds is turning a rejection into a sentence.
 */

export async function openGameRoundVote(_previous: FormActionState, formData: FormData): Promise<FormActionState> {
  await requireUser();

  const round = roundId(formData);
  if (!round.success) return { message: "That round is no longer available." };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("open_game_round_vote", { p_round_id: round.data });

  if (error) return { message: readableError(error, "We couldn't open the vote. Please try again.") };

  revalidatePath("/game", "layout");
  return { message: "" };
}

export async function rerollGameWord(_previous: FormActionState, formData: FormData): Promise<FormActionState> {
  await requireUser();

  const round = roundId(formData);
  if (!round.success) return { message: "That round is no longer available." };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("reroll_game_word", { p_round_id: round.data });

  if (error) return { message: readableError(error, "We couldn't swap the word. Please try again.") };

  revalidatePath("/game", "layout");
  return { message: "" };
}

export async function kickGamePlayer(_previous: FormActionState, formData: FormData): Promise<FormActionState> {
  await requireUser();

  const room = resourceIdSchema.safeParse(formData.get("roomId"));
  const target = resourceIdSchema.safeParse(formData.get("userId"));
  if (!room.success || !target.success) return { message: "That player is no longer in the game." };

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.rpc("kick_game_player", {
    p_room_id: room.data,
    p_user_id: target.data,
  });

  if (error) return { message: readableError(error, "We couldn't remove that player. Please try again.") };

  revalidatePath("/game", "layout");
  return { message: "" };
}
