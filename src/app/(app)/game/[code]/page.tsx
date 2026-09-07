import Link from "next/link";
import { Crown, Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { SavedToast } from "@/components/saved-toast";
import { InviteCode } from "@/components/game/invite-code";
import { GameLive } from "@/components/game/game-live";
import { LobbySettingsForm } from "@/components/game/lobby-settings";
import { RoundBoard } from "@/components/game/round-board";
import { StartRoundButton } from "@/components/game/round-forms";
import { endGameRoom, leaveGameRoom } from "@/app/actions/game";
import { requireUser } from "@/lib/auth";
import { fetchLobby, fetchWordCategories } from "@/lib/game-lobby";
import { fetchCurrentRound } from "@/lib/game-round";
import { describeGameSettings, normalizeGameCode, startBlocker } from "@/lib/game";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

const SAVED_MESSAGES: Record<string, string> = {
  "room-created": "Game created — share the code",
  "room-joined": "You're in",
};

/**
 * Shown for a code that is wrong, and for one whose game has already ended.
 *
 * Those two cases are deliberately not distinguished, and cannot be: a room you
 * are not a member of is invisible to your RLS-scoped read, which is the same
 * "not found" a nonexistent code produces. Telling them apart would mean a
 * lookup that confirms a code exists to someone who was not invited to it.
 */
function NoSuchGame() {
  return <Card className="mx-auto max-w-lg text-center">
    <CardHeader><CardTitle>That game isn&rsquo;t open</CardTitle></CardHeader>
    <CardContent className="grid gap-4">
      <p className="text-sm leading-6 text-[var(--muted-foreground)]">The code may be mistyped, or the game may have already finished. Ask whoever invited you for a fresh code.</p>
      <Link href="/game" className={cn(buttonVariants({ variant: "outline" }), "mx-auto")}>Back to Imposter</Link>
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
  if (!lobby) return <NoSuchGame />;

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

  // Only the host can change the settings, so only the host needs the picker's
  // options -- no reason to make everyone else pay for the query.
  const categories = lobby.isHost ? await fetchWordCategories() : [];
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
            {lobby.players.map((player) => <div key={player.userId} className="flex items-center gap-3 rounded-xl border bg-[var(--card)]/45 px-3.5 py-2.5">
              <span
                aria-hidden
                className={cn("size-2.5 shrink-0 rounded-full", player.present ? "bg-[var(--success)]" : "bg-[var(--muted)]")}
              />
              <span className="min-w-0 flex-1 truncate text-sm font-medium">
                {player.displayName}
                {player.isYou && <span className="ml-1.5 text-xs font-normal text-[var(--muted-foreground)]">(you)</span>}
              </span>
              {player.isHost && <span className="flex items-center gap-1 text-xs font-semibold text-[var(--primary)]"><Crown className="size-3.5" />Host</span>}
              <span className="sr-only">{player.present ? "Connected" : "Away"}</span>
            </div>)}
          </CardContent>
        </Card>

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
              <p>{lobby.settings.decoyMode ? "The imposter gets a decoy word — something close, but wrong." : "The imposter gets nothing at all and has to bluff."}</p>
              <p>{lobby.settings.categoryHint ? "The imposter is told the category." : "The imposter isn't told the category."}</p>
              <p>{lobby.settings.cluePasses === 1 ? "One clue each" : `${lobby.settings.cluePasses} clues each`}, then a vote.</p>
              <p>{lobby.settings.imposterFinalGuess ? "A caught imposter still wins by naming the word." : "Getting caught ends it — no final guess."}</p>
              <p>Words come from {lobby.settings.categoryFilter ?? "every category"}.</p>
            </CardContent>
          </Card>}
    </div>
  </>;
}
