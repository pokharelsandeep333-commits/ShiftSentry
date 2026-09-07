import Link from "next/link";
import { Crown, Trophy, Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { SavedToast } from "@/components/saved-toast";
import { InviteCode } from "@/components/game/invite-code";
import { GameLive } from "@/components/game/game-live";
import { LobbySettingsForm } from "@/components/game/lobby-settings";
import { RoundBoard } from "@/components/game/round-board";
import { KickPlayerButton, StartRoundButton } from "@/components/game/round-forms";
import { endGameRoom, leaveGameRoom } from "@/app/actions/game";
import { requireUser } from "@/lib/auth";
import { fetchEndedRoom, fetchLobby, fetchWordCategories } from "@/lib/game-lobby";
import { fetchCurrentRound, fetchRoomScoreboard } from "@/lib/game-round";
import { IMPOSTER_HINT_LABELS, describeGameSettings, normalizeGameCode, startBlocker } from "@/lib/game";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const SAVED_MESSAGES: Record<string, string> = {
  "room-created": "Game created — share the code",
  "room-joined": "You're in",
};

/**
 * A code that matches no game this person can see.
 *
 * Kept separate from the finished-game card below, because conflating the two is
 * what made ending a game look like a typo. This one is genuinely all that can
 * be said: a room you were never in is invisible to your RLS-scoped read, which
 * is indistinguishable from a room that never existed -- deliberately, since
 * telling them apart would confirm a code to someone who was not invited.
 */
function NoSuchGame() {
  return <Card className="mx-auto max-w-lg text-center">
    <CardHeader><CardTitle>That code doesn&rsquo;t match a game</CardTitle></CardHeader>
    <CardContent className="grid gap-4">
      <p className="text-sm leading-6 text-[var(--muted-foreground)]">Check the six characters and try again, or ask whoever invited you to send it across.</p>
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
    // they get told the truth instead.
    const finished = await fetchEndedRoom(code);
    return finished ? <GameOver /> : <NoSuchGame />;
  }

  // A room in play shows the round instead of the lobby. `finish_game_round`
  // puts the room back to LOBBY, so this branch also decides when the reveal
  // stops being the screen -- the host closing the round is what ends it, not a
  // timer, so nobody loses the answer before they have read it.
  if (lobby.status === "PLAYING") {
    const round = await fetchCurrentRound(lobby.id, profile.id, lobby.players);

    if (round) {
      return <>
        <GameLive roomId={lobby.id} />
        <PageHeader
          eyebrow={`Game ${lobby.code}`}
          title={`Round ${round.roundNo}`}
          description={describeGameSettings(lobby.settings)}
        />
        <RoundBoard round={round} isHost={lobby.isHost} />
      </>;
    }
  }

  const [categories, scoreboard] = await Promise.all([
    // Only the host can change the settings, so only the host needs the picker's
    // options -- no reason to make everyone else pay for the query.
    lobby.isHost ? fetchWordCategories() : Promise.resolve([]),
    fetchRoomScoreboard(lobby.id, lobby.players),
  ]);

  const blocker = startBlocker(lobby.players.length, lobby.settings.imposterCount);
  const savedMessage = SAVED_MESSAGES[Array.isArray(saved) ? saved[0] ?? "" : saved ?? ""];

  return <>
    {savedMessage && <SavedToast message={savedMessage} />}
    <GameLive roomId={lobby.id} />

    <PageHeader
      eyebrow="Imposter lobby"
      title={lobby.isHost ? "Your game" : "Waiting to start"}
      description={describeGameSettings(lobby.settings)}
    />

    <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
      <div className="grid gap-6 self-start">
        <InviteCode code={lobby.code} />

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="size-4 text-[var(--primary)]" />
              Players
              <span className="ml-auto text-sm font-normal text-[var(--muted-foreground)]">{lobby.players.length} / {lobby.settings.maxPlayers}</span>
            </CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {lobby.players.map((player) => <div key={player.userId} className="flex items-center gap-3 rounded-xl border bg-[var(--card)]/45 py-1.5 pl-3.5 pr-1.5">
              <span
                aria-hidden
                className={cn("size-2.5 shrink-0 rounded-full", player.present ? "bg-[var(--success)]" : "bg-[var(--muted)]")}
              />
              <span className="min-w-0 flex-1 truncate py-1 text-sm font-medium">
                {player.displayName}
                {player.isYou && <span className="ml-1.5 text-xs font-normal text-[var(--muted-foreground)]">(you)</span>}
              </span>
              <span className="sr-only">{player.present ? "Connected" : "Away"}</span>
              {player.isHost
                ? <span className="flex items-center gap-1 px-2 text-xs font-semibold text-[var(--primary)]"><Crown className="size-3.5" />Host</span>
                : lobby.isHost && <KickPlayerButton roomId={lobby.id} userId={player.userId} displayName={player.displayName} />}
            </div>)}
          </CardContent>
        </Card>

        {scoreboard.length > 0 && <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Trophy className="size-4 text-[var(--primary)]" />Scoreboard</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-2">
            {scoreboard.map((row) => <div key={row.userId} className="flex items-baseline gap-3 rounded-xl bg-[var(--surface-subtle)] px-3.5 py-2.5">
              <span className="min-w-0 flex-1 truncate text-sm font-medium">{row.displayName}</span>
              {row.imposterRounds > 0 && <span className="shrink-0 text-xs text-[var(--muted-foreground)]">{row.imposterWins}/{row.imposterRounds} as imposter</span>}
              <span className="shrink-0 text-sm font-semibold">{row.wins}<span className="font-normal text-[var(--muted-foreground)]">/{row.roundsPlayed}</span></span>
            </div>)}
            <p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">Rounds won out of rounds played, for this game only.</p>
          </CardContent>
        </Card>}

        <Card>
          <CardContent className="grid gap-3 pt-5 sm:pt-6">
            {blocker
              ? <p className="rounded-xl bg-[var(--surface-subtle)] px-3 py-2.5 text-sm leading-5 text-[var(--muted-foreground)]">{blocker.message}</p>
              : <p className="rounded-xl bg-[var(--primary-soft)] px-3 py-2.5 text-sm leading-5 text-[var(--primary)]">Everyone&rsquo;s here. Ready when you are.</p>}

            {lobby.isHost
              ? <StartRoundButton roomId={lobby.id} blocked={blocker !== null} />
              : <p className="text-center text-xs text-[var(--muted-foreground)]">Waiting for the host to start.</p>}

            <div className="flex flex-wrap justify-center gap-2 border-t pt-3">
              <form action={leaveGameRoom}>
                <input type="hidden" name="roomId" value={lobby.id} />
                <Button type="submit" variant="ghost" size="sm">Leave game</Button>
              </form>
              {lobby.isHost && <form action={endGameRoom}>
                <input type="hidden" name="roomId" value={lobby.id} />
                <ConfirmSubmit label="End game" confirmLabel="End for everyone?" />
              </form>}
            </div>
          </CardContent>
        </Card>
      </div>

      {lobby.isHost
        ? <Card className="h-fit">
            <CardHeader><CardTitle>Game settings</CardTitle></CardHeader>
            <CardContent><LobbySettingsForm roomId={lobby.id} settings={lobby.settings} categories={categories} /></CardContent>
          </Card>
        : <Card className="h-fit">
            <CardHeader><CardTitle>How this game is set up</CardTitle></CardHeader>
            <CardContent className="grid gap-2.5 text-sm leading-6 text-[var(--muted-foreground)]">
              <p>{lobby.settings.imposterCount === 1 ? "One imposter" : `${lobby.settings.imposterCount} imposters`} among {lobby.players.length} {lobby.players.length === 1 ? "player" : "players"}.</p>
              <p>{lobby.settings.hideRoles
                ? "Roles are hidden — everyone gets a word and nobody is told whose is the odd one."
                : `The imposter gets: ${IMPOSTER_HINT_LABELS[lobby.settings.imposterHint].label.toLowerCase()}.`}</p>
              <p>{lobby.settings.cluePasses === 1 ? "One clue each" : `${lobby.settings.cluePasses} clues each`}, {lobby.settings.discussionPhase ? "then a discussion, then the vote." : "then straight to the vote."}</p>
              <p>{lobby.settings.banRepeatClues ? "Repeated clues are refused." : "Repeating someone else's clue is allowed."}</p>
              <p>{lobby.settings.imposterFinalGuess ? "A caught imposter still wins by naming the word." : "Getting caught ends it — no final guess."}</p>
              <p>Words come from {lobby.settings.categoryFilter ?? "every category"}.</p>
            </CardContent>
          </Card>}
    </div>
  </>;
}
