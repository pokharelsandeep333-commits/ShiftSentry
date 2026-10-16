export const metadata = { title: "Game room | ShiftSentry" };

import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { JoinInvite } from "@/components/game/join-invite";
import { TurnAttention } from "@/components/game/turn-attention";
import { GameLive } from "@/components/game/game-live";
import { LobbyView } from "@/components/game/lobby-view";
import { RoundBoard } from "@/components/game/round-board";
import { phaseLabel } from "@/components/game/phase-tracker";
import { requireUser } from "@/lib/auth";
import { fetchAbandonedRoundNo, fetchEndedRoom, fetchLobby, fetchWordCategories } from "@/lib/game-lobby";
import { fetchCurrentRound, fetchRoomScoreboard } from "@/lib/game-round";
import { describeGameSettings, normalizeGameCode } from "@/lib/game";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const SAVED_MESSAGES: Record<string, string> = {
  "room-created": "Game created. Share the code",
  "room-joined": "You're in",
};

/**
 * A URL whose code cannot be one -- wrong length, or a character the alphabet
 * excludes. A well-formed code that matches no room this person can see does
 * not land here: it gets the invite card, because a room you are not yet in is
 * invisible to your RLS-scoped read, which is indistinguishable from a room
 * that never existed -- deliberately, since telling them apart would confirm
 * a code to someone who was not invited. The join function is the one place
 * that can say which it was, and it says so only to someone who tried.
 */
function NoSuchGame() {
  return <Card className="mx-auto max-w-lg text-center">
    <CardHeader><CardTitle>That isn&rsquo;t a game code</CardTitle></CardHeader>
    <CardContent className="grid gap-4">
      <p className="text-sm leading-6 text-[var(--muted-foreground)]">A code is six characters, like 7KQ2MP. Check what you were sent and try again.</p>
      <Link href="/game" className={cn(buttonVariants({ variant: "outline" }), "mx-auto")}>Back to Imposter</Link>
    </CardContent>
  </Card>;
}

/** A game this player was actually in, which its host has since ended. */
function GameOver() {
  return <Card className="mx-auto max-w-lg text-center">
    <CardHeader><CardTitle>This game has finished</CardTitle></CardHeader>
    <CardContent className="grid gap-4">
      <p className="text-sm leading-6 text-[var(--muted-foreground)]">The host ended it. Start your own, or join another with a fresh code.</p>
      <Link href="/game" className={cn(buttonVariants(), "mx-auto")}>Back to Imposter</Link>
    </CardContent>
  </Card>;
}

type GameLobbyPageProps = {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ saved?: string | string[] }>;
};

export default async function GameLobbyPage({ params, searchParams }: GameLobbyPageProps) {
  const [profile, { code: rawCode }, { saved }] = await Promise.all([requireUser(), params, searchParams]);

  const code = normalizeGameCode(rawCode);
  if (!code) return <NoSuchGame />;

  const lobby = await fetchLobby(code, profile.id);

  if (!lobby) {
    // Ending a game used to drop every other player onto "check your spelling",
    // with the poll stopped and no way to find out what had happened. Someone
    // who was in the room can still read it once the ENDED filter comes off, so
    // they get told the truth instead. Everyone else -- which is what a link or
    // a QR scan arrives as -- is offered the join.
    const finished = await fetchEndedRoom(code);
    return finished ? <GameOver /> : <JoinInvite code={code} />;
  }

  // A room in play shows the round instead of the lobby. `finish_game_round`
  // puts the room back to LOBBY, so this branch also decides when the reveal
  // stops being the screen -- the host closing the round is what ends it, not a
  // timer, so nobody loses the answer before they have read it.
  if (lobby.status === "PLAYING") {
    const round = await fetchCurrentRound(lobby.id, profile.id, lobby.players);

    if (round) {
      // What the round is waiting on this player for, if anything. Only players
      // seated this round get a vote, which is the same gate the vote panel uses.
      const seated = Boolean(round.yourRole || round.rolesHidden || round.yourWord);
      const waitingOnYou =
        round.isYourTurn ? "Your turn to give a clue"
        : round.awaitingYourGuess ? "Your final guess"
        : round.status === "VOTING" && seated && !round.youHaveVoted ? "Time to vote"
        : null;

      return <>
        <GameLive roomId={lobby.id} />
        {waitingOnYou && <TurnAttention prompt={`${waitingOnYou} · Imposter`} />}
        <PageHeader
          title={`Round ${round.roundNo} · ${phaseLabel(round)}`}
          description={`Game ${lobby.code} · ${describeGameSettings(lobby.settings)}`}
        />
        <RoundBoard round={round} isHost={lobby.isHost} />
      </>;
    }
  }

  const [categories, scoreboard, abandonedRoundNo] = await Promise.all([
    // Only the host can change the settings, so only the host needs the picker's
    // options -- no reason to make everyone else pay for the query.
    lobby.isHost ? fetchWordCategories(lobby.settings.wordDifficulty) : Promise.resolve([]),
    fetchRoomScoreboard(lobby.id, lobby.players),
    fetchAbandonedRoundNo(lobby.id),
  ]);

  const savedMessage = SAVED_MESSAGES[Array.isArray(saved) ? saved[0] ?? "" : saved ?? ""];

  return <>
    <GameLive roomId={lobby.id} />
    <LobbyView lobby={lobby} categories={categories} scoreboard={scoreboard} abandonedRoundNo={abandonedRoundNo} savedMessage={savedMessage} />
  </>;
}
