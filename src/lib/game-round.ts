import { createServerSupabaseClient } from "@/lib/supabase/server";
import type { LobbyPlayer } from "@/lib/game-lobby";
import { isImposterHint, type ImposterHint } from "@/lib/game";

/**
 * Reads for a round in progress.
 *
 * The shape of this file is dictated by one constraint: `game_rounds.word_id`
 * carries no grant, so `select *` on that table is a runtime permission error,
 * not a type error. Every round query therefore names its columns, and
 * `ROUND_COLUMNS` is the single list they all use -- adding a column to the
 * table means adding it both to the grant in the migration and to that constant,
 * and forgetting either is caught the first time the page loads.
 *
 * The word itself never comes back through these queries. It arrives one of two
 * ways: your own copy of it from `game_round_secrets`, which RLS scopes to you,
 * or `game_round_reveal`, which returns nothing until the round is over.
 */

const ROUND_COLUMNS =
  "id,room_id,round_no,status,imposter_hint,hide_roles,imposter_final_guess,imposter_count,clue_passes,current_pass,started_at,ended_at,caught_user_id,final_guess,outcome,ban_repeat_clues,discussion_phase,tiebreak_count";

export type RoundPhase = "DEALING" | "CLUES" | "DISCUSSION" | "VOTING" | "GUESSING" | "REVEAL" | "ENDED";

export type RoundSeat = {
  userId: string;
  displayName: string;
  turnOrder: number;
  eliminated: boolean;
  isYou: boolean;
  hasVoted: boolean;
  isTurn: boolean;
  hasLeft: boolean;
};

export type RoundClue = {
  userId: string;
  displayName: string;
  passNo: number;
  clue: string;
};

export type RoundReveal = {
  word: string;
  decoyWord: string;
  category: string;
  imposterIds: string[];
};

export type RoundView = {
  id: string;
  roundNo: number;
  status: RoundPhase;
  currentPass: number;
  cluePasses: number;
  imposterHint: ImposterHint;
  imposterCount: number;
  imposterFinalGuess: boolean;
  discussionPhase: boolean;

  /**
   * How many times this round's vote has deadlocked and been sent back for
   * another clue pass. Capped in the database.
   */
  tiebreakCount: number;

  /** The round is in an extra pass it only has because the vote tied. */
  isTiebreak: boolean;

  /**
   * The round is being played with roles hidden, so `yourRole` is null for
   * everyone until the reveal -- withheld by the database, not by this layer.
   */
  rolesHidden: boolean;

  seats: RoundSeat[];
  clues: RoundClue[];

  /** Your own role and word. Null for a spectator who joined after the deal. */
  yourRole: "CREW" | "IMPOSTER" | null;
  yourWord: string | null;
  yourCategoryHint: string | null;

  turnUserId: string | null;
  isYourTurn: boolean;
  youHaveVoted: boolean;

  /** Who you voted for, so the vote screen can show it. Yours only -- the policy sees to that. */
  yourVoteTargetId: string | null;

  caughtUserId: string | null;
  finalGuess: string | null;
  outcome: "CREW_WIN" | "IMPOSTER_WIN" | null;
  awaitingYourGuess: boolean;

  /** Only ever populated once the round has reached REVEAL. */
  reveal: RoundReveal | null;
  votes: { voterId: string; targetId: string }[];
};

/**
 * The room's most recent round, assembled for the play screen.
 *
 * Names come from the lobby roster that the caller already fetched rather than
 * from a second query, and a seat with no matching roster entry is somebody who
 * left mid-round -- they stay visible so the clues they gave still have a face,
 * but they are marked so the screen can stop waiting on them.
 */
export async function fetchCurrentRound(
  roomId: string,
  viewerId: string,
  roster: LobbyPlayer[],
): Promise<RoundView | null> {
  const supabase = await createServerSupabaseClient();

  const { data: round } = await supabase
    .from("game_rounds")
    .select(ROUND_COLUMNS)
    .eq("room_id", roomId)
    .order("round_no", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!round) return null;

  const status = round.status as RoundPhase;
  const revealed = status === "REVEAL" || status === "ENDED";

  const [seatRows, clueRows, secret, voters, reveal, votes, myVote] = await Promise.all([
    supabase.from("game_round_players").select("user_id,turn_order,eliminated_at").eq("round_id", round.id),
    supabase.from("game_clues").select("user_id,pass_no,clue,created_at").eq("round_id", round.id).order("pass_no").order("created_at"),
    // Through a function, not a table read: `game_round_secrets` carries no
    // grant any more, because a role hidden only in the markup is still sitting
    // in the network tab. The function withholds it at the source.
    supabase.rpc("game_my_round_secret", { p_round_id: round.id }),
    supabase.rpc("game_round_voters", { p_round_id: round.id }),
    revealed ? supabase.rpc("game_round_reveal", { p_round_id: round.id }) : Promise.resolve({ data: null }),
    revealed ? supabase.from("game_votes").select("voter_id,target_id").eq("round_id", round.id) : Promise.resolve({ data: null }),
    // Readable at any point in the round: the policy scopes an unrevealed round
    // to your own ballot, which is exactly the one the screen needs to show back.
    supabase.from("game_votes").select("target_id").eq("round_id", round.id).eq("voter_id", viewerId).maybeSingle(),
  ]);

  const names = new Map(roster.map((player) => [player.userId, player.displayName]));
  const votedIds = new Set((voters.data ?? []) as string[]);

  // Whose turn it is, computed here rather than fetched: the same rule as
  // `game_round_turn` in SQL, over rows already in hand. One fewer round trip on
  // a screen that reloads every couple of seconds.
  const seats: RoundSeat[] = (seatRows.data ?? [])
    .map((seat) => ({
      userId: seat.user_id,
      displayName: names.get(seat.user_id) ?? "Left the game",
      turnOrder: seat.turn_order,
      eliminated: seat.eliminated_at !== null,
      isYou: seat.user_id === viewerId,
      hasVoted: votedIds.has(seat.user_id),
      hasLeft: !names.has(seat.user_id),
      isTurn: false,
    }))
    .sort((left, right) => left.turnOrder - right.turnOrder);

  const cluesThisPass = new Set(
    (clueRows.data ?? []).filter((clue) => clue.pass_no === round.current_pass).map((clue) => clue.user_id),
  );
  const nextUp = status === "CLUES"
    ? seats.find((seat) => !seat.eliminated && !seat.hasLeft && !cluesThisPass.has(seat.userId))
    : undefined;
  if (nextUp) nextUp.isTurn = true;

  const revealRow = reveal.data?.[0] ?? null;
  const mine = secret.data?.[0] ?? null;

  return {
    id: round.id,
    roundNo: round.round_no,
    status,
    currentPass: round.current_pass,
    cluePasses: round.clue_passes,
    imposterHint: isImposterHint(round.imposter_hint) ? round.imposter_hint : "NONE",
    imposterCount: round.imposter_count,
    imposterFinalGuess: round.imposter_final_guess,
    discussionPhase: round.discussion_phase,
    tiebreakCount: round.tiebreak_count,
    // A pass beyond the configured count exists only because a vote tied.
    isTiebreak: round.current_pass > round.clue_passes,
    rolesHidden: round.hide_roles,

    seats,
    clues: (clueRows.data ?? []).map((clue) => ({
      userId: clue.user_id,
      displayName: names.get(clue.user_id) ?? "Left the game",
      passNo: clue.pass_no,
      clue: clue.clue,
    })),

    yourRole: (mine?.role as "CREW" | "IMPOSTER" | null | undefined) ?? null,
    yourWord: mine?.assigned_word ?? null,
    yourCategoryHint: mine?.hint_text ?? null,

    turnUserId: nextUp?.userId ?? null,
    isYourTurn: nextUp?.userId === viewerId,
    youHaveVoted: votedIds.has(viewerId),
    yourVoteTargetId: myVote.data?.target_id ?? null,

    caughtUserId: round.caught_user_id,
    finalGuess: round.final_guess,
    outcome: (round.outcome as "CREW_WIN" | "IMPOSTER_WIN" | null) ?? null,
    awaitingYourGuess: status === "GUESSING" && round.caught_user_id === viewerId,

    reveal: revealRow
      ? {
          word: revealRow.word,
          decoyWord: revealRow.decoy_word,
          category: revealRow.category,
          imposterIds: revealRow.imposter_ids,
        }
      : null,
    votes: (votes.data ?? []).map((vote) => ({ voterId: vote.voter_id, targetId: vote.target_id })),
  };
}

export type ScoreboardRow = {
  userId: string;
  displayName: string;
  roundsPlayed: number;
  wins: number;
  imposterRounds: number;
  imposterWins: number;
};

/**
 * The room's running tally, ordered by wins.
 *
 * A function rather than a query the client assembles, because working out who
 * won a round means knowing who was the imposter -- and `game_round_secrets` is
 * readable by nobody. Only decided rounds count, so a game in progress does not
 * appear on the board before it has an outcome.
 */
export async function fetchRoomScoreboard(roomId: string, roster: LobbyPlayer[]): Promise<ScoreboardRow[]> {
  const supabase = await createServerSupabaseClient();
  const { data } = await supabase.rpc("game_room_scoreboard", { p_room_id: roomId });
  if (!data?.length) return [];

  const names = new Map(roster.map((player) => [player.userId, player.displayName]));

  return data
    .map((row) => ({
      userId: row.user_id,
      displayName: names.get(row.user_id) ?? "Left the game",
      roundsPlayed: row.rounds_played,
      wins: row.wins,
      imposterRounds: row.imposter_rounds,
      imposterWins: row.imposter_wins,
    }))
    .sort((left, right) => right.wins - left.wins || right.roundsPlayed - left.roundsPlayed || left.displayName.localeCompare(right.displayName));
}
