import { createServerSupabaseClient } from "@/lib/supabase/server";
import { isImposterHint, isWordDifficulty, type GameSettings, type WordDifficulty } from "@/lib/game";

/**
 * Reads for the lobby. Everything here goes through the RLS-scoped client, so a
 * room you are not in simply is not there -- no ownership check is written in
 * TypeScript because none would be load-bearing.
 *
 * The one exception is the category list, which is an RPC precisely because the
 * word bank is unreadable: see `game_word_categories` in
 * `20260907130000_imposter_game_lobby.sql`.
 */

/**
 * How long a player stays "here" after their last heartbeat.
 *
 * Comfortably more than the 2.5s poll so an ordinary slow round trip does not
 * flicker somebody out of the room, and short enough that a closed tab is
 * noticed before the host wonders who they are waiting for.
 */
export const PRESENCE_WINDOW_MS = 20_000;

export type LobbyPlayer = {
  userId: string;
  displayName: string;
  joinedAt: string;
  lastSeenAt: string;
  isHost: boolean;
  isYou: boolean;
  present: boolean;
};

export type Lobby = {
  id: string;
  code: string;
  status: "LOBBY" | "PLAYING" | "ENDED";
  hostId: string;
  isHost: boolean;
  settings: GameSettings;
  players: LobbyPlayer[];
};

const ROOM_COLUMNS =
  "id,code,status,host_id,imposter_hint,hide_roles,imposter_final_guess,imposter_count,clue_passes,max_players,ban_repeat_clues,discussion_phase,word_difficulty,category_filter";

/**
 * One query, not two: the roster comes back as a PostgREST embed on the room.
 * The embedded rows are filtered by their own table's policy, so a room you can
 * see is a room whose players you can see -- the two policies agree by
 * construction rather than by a matching `.eq()` written here.
 */
export async function fetchLobby(code: string, viewerId: string): Promise<Lobby | null> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("game_rooms")
    .select(`${ROOM_COLUMNS},game_room_players(user_id,display_name,joined_at,last_seen_at)`)
    .eq("code", code)
    .neq("status", "ENDED")
    .maybeSingle();

  if (!data) return null;

  const now = Date.now();
  const players: LobbyPlayer[] = (data.game_room_players ?? [])
    .map((player) => ({
      userId: player.user_id,
      displayName: player.display_name,
      joinedAt: player.joined_at,
      lastSeenAt: player.last_seen_at,
      isHost: player.user_id === data.host_id,
      isYou: player.user_id === viewerId,
      present: now - new Date(player.last_seen_at).getTime() < PRESENCE_WINDOW_MS,
    }))
    // Host first, then join order, so the list does not reshuffle under anyone
    // as the poll refreshes.
    .sort((left, right) => Number(right.isHost) - Number(left.isHost) || left.joinedAt.localeCompare(right.joinedAt));

  return {
    id: data.id,
    code: data.code,
    status: data.status,
    hostId: data.host_id,
    isHost: data.host_id === viewerId,
    settings: {
      imposterHint: isImposterHint(data.imposter_hint) ? data.imposter_hint : "NONE",
      hideRoles: data.hide_roles,
      imposterFinalGuess: data.imposter_final_guess,
      imposterCount: data.imposter_count,
      cluePasses: data.clue_passes,
      maxPlayers: data.max_players,
      banRepeatClues: data.ban_repeat_clues,
      discussionPhase: data.discussion_phase,
      wordDifficulty: isWordDifficulty(data.word_difficulty) ? data.word_difficulty : "NORMAL",
      categoryFilter: data.category_filter,
    },
    players,
  };
}

/**
 * The room to offer someone on the game landing page.
 *
 * A player only ever has one live room in practice -- hosting a new one ends the
 * previous -- but joining somebody else's while still seated in your own is
 * legal, so this takes the most recent rather than assuming there is one.
 */
export async function fetchActiveRoomCode(): Promise<string | null> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("game_rooms")
    .select("code,created_at")
    .neq("status", "ENDED")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  return data?.code ?? null;
}

/**
 * Categories with the number of words actually drawable at the room's ceiling --
 * not the size of the whole category, or a host on EASY is told "Places (52)"
 * and then draws from a fraction of that.
 */
export async function fetchWordCategories(difficulty: WordDifficulty): Promise<{ category: string; wordCount: number }[]> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.rpc("game_word_categories", { p_difficulty: difficulty });
  return (data ?? []).map((row) => ({ category: row.category, wordCount: Number(row.word_count) }));
}

/**
 * Was this a game the viewer was actually in, that has since ended?
 *
 * `fetchLobby` filters out ENDED rooms, so a finished game and a mistyped code
 * both come back as null -- which is why ending a game used to drop everyone
 * onto a card telling them to check their spelling. This looks the same room up
 * without the status filter.
 *
 * It leaks nothing: the select policy on game_rooms still requires membership,
 * so a stranger guessing a code gets null here exactly as before. Only someone
 * who was in the room learns that the room existed, which they already knew.
 */
export async function fetchEndedRoom(code: string): Promise<{ code: string; endedAt: string | null } | null> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase
    .from("game_rooms")
    .select("code,ended_at")
    .eq("code", code)
    .eq("status", "ENDED")
    .maybeSingle();

  return data ? { code: data.code, endedAt: data.ended_at } : null;
}
