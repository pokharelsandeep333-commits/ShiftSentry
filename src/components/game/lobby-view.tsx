import { CheckCircle2, Settings2, Trophy, Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SubmitButton } from "@/components/ui/submit-button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { SavedToast } from "@/components/saved-toast";
import { InviteCode } from "@/components/game/invite-code";
import { LobbySettingsForm } from "@/components/game/lobby-settings";
import { PlayerAvatar } from "@/components/game/player-avatar";
import { PlayerTiles } from "@/components/game/player-tiles";
import { StartRoundButton } from "@/components/game/round-forms";
import { SetupEditor } from "@/components/game/setup-editor";
import { SetupChips, SetupList } from "@/components/game/setup-summary";
import { endGameRoom, leaveGameRoom } from "@/app/actions/game";
import type { Lobby } from "@/lib/game-lobby";
import type { ScoreboardRow } from "@/lib/game-round";
import { MIN_PLAYERS_TO_START, startBlocker } from "@/lib/game";
import { cn } from "@/lib/utils";

type LobbyViewProps = {
  lobby: Lobby;
  categories: { category: string; wordCount: number }[];
  scoreboard: ScoreboardRow[];
  abandonedRoundNo: number | null;
  savedMessage?: string;
};

/**
 * The lobby, drawn from data the page already loaded (`/game/[code]` keeps the
 * fetching and the live connection). Reading order is the order of what to do:
 * the status card first -- the code to share and, for the host, Start round --
 * then who is here, then the rules, then the scoreboard. Leaving and ending sit
 * last, out of the way of the button people actually want.
 *
 * `min-w-0` on the columns is load-bearing, not decorative: a grid item
 * defaults to `min-width: auto`, so a long player name would otherwise force
 * its column wider than a 320px screen instead of truncating.
 */
export function LobbyView({ lobby, categories, scoreboard, abandonedRoundNo, savedMessage }: LobbyViewProps) {
  const playerCount = lobby.players.length;
  const blocker = startBlocker(playerCount, lobby.settings.imposterCount);
  const enoughPlayers = playerCount >= MIN_PLAYERS_TO_START;

  return <>
    {savedMessage && <SavedToast message={savedMessage} />}

    <PageHeader
      title={lobby.isHost ? "Your lobby" : "Lobby"}
      description={lobby.isHost
        ? `Share the code, wait for at least ${MIN_PLAYERS_TO_START} players, then start the round.`
        : "You're in. The host starts the round once everyone's here."}
    />

    <Card className="mb-6 overflow-hidden">
      <div className="grid lg:grid-cols-2">
        <div className="border-b bg-[var(--primary-soft)] p-5 sm:p-6 lg:border-b-0 lg:border-r">
          <InviteCode code={lobby.code} bare />
        </div>
        <div className="grid content-center gap-4 p-5 sm:p-6">
          <div>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <p><span className="font-display text-2xl font-semibold">{playerCount}</span> <span className="text-[var(--muted-foreground)]">{playerCount === 1 ? "player" : "players"} in · up to {lobby.settings.maxPlayers}</span></p>
              <p className={cn("flex items-center gap-1 text-xs font-semibold", enoughPlayers ? "text-[var(--success)]" : "text-[var(--muted-foreground)]")}>
                {enoughPlayers ? <><CheckCircle2 className="size-3.5" aria-hidden="true" />Enough to play</> : `${MIN_PLAYERS_TO_START} needed`}
              </p>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-[var(--muted)]" aria-hidden="true">
              <div className={cn("h-full rounded-full transition-[width] duration-500", enoughPlayers ? "bg-[var(--success)]" : "bg-[var(--primary)]")} style={{ width: `${Math.min(100, (playerCount / MIN_PLAYERS_TO_START) * 100)}%` }} />
            </div>
          </div>

          {/* Everyone in the room sees this, not just the host who pressed the
              button -- the players who were mid-clue are the ones owed an
              explanation. It clears itself the moment the next round starts,
              because the round it names is no longer the latest one. */}
          {abandonedRoundNo !== null && <p className="rounded-xl border border-dashed px-3 py-2.5 text-sm leading-5 text-[var(--muted-foreground)]">
            Round {abandonedRoundNo} was ended early, so it counts for nobody. {lobby.isHost ? "Change whatever you like, then deal again." : "The host can change the setup before dealing again."}
          </p>}

          {blocker
            ? <p className="text-sm leading-6 text-[var(--muted-foreground)]">{blocker.message}</p>
            : <p className="text-sm font-semibold text-[var(--primary)]">Everyone&rsquo;s here. Ready when you are.</p>}

          {lobby.isHost
            ? <StartRoundButton roomId={lobby.id} blocked={blocker !== null} />
            : <p className="flex items-center gap-2 rounded-xl bg-[var(--surface-subtle)] px-3 py-2.5 text-sm text-[var(--muted-foreground)]">
                <span className="size-2 shrink-0 animate-pulse rounded-full bg-[var(--primary)]" aria-hidden="true" />
                Waiting for the host to start.
              </p>}
        </div>
      </div>
    </Card>

    {/* One grid, three cards, in phone reading order: players, setup,
        scoreboard. From lg the setup moves to the right column across both
        rows; `self-start` keeps each card its own height, and the second row
        takes the slack so a tall setup form never pushes the scoreboard down. */}
    <div className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr] lg:grid-rows-[auto_1fr] [&>*]:min-w-0 [&>*]:self-start">
      <Card className="lg:col-start-1 lg:row-start-1">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="size-4 text-[var(--primary)]" aria-hidden="true" />
            Players
            <span className="ml-auto text-sm font-normal text-[var(--muted-foreground)]">{playerCount} / {lobby.settings.maxPlayers}</span>
          </CardTitle>
        </CardHeader>
        <CardContent><PlayerTiles roomId={lobby.id} players={lobby.players} viewerIsHost={lobby.isHost} /></CardContent>
      </Card>

      <Card className="lg:col-start-2 lg:row-span-2 lg:row-start-1">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Settings2 className="size-4 text-[var(--primary)]" aria-hidden="true" />Game setup</CardTitle>
        </CardHeader>
        <CardContent>
          {lobby.isHost
            ? <SetupEditor summary={<SetupChips settings={lobby.settings} playerCount={playerCount} />}>
                <LobbySettingsForm roomId={lobby.id} settings={lobby.settings} categories={categories} />
              </SetupEditor>
            : <SetupList settings={lobby.settings} playerCount={playerCount} />}
        </CardContent>
      </Card>

      {scoreboard.length > 0 && <Card className="lg:col-start-1 lg:row-start-2">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Trophy className="size-4 text-[var(--primary)]" aria-hidden="true" />Scoreboard</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          <ol className="grid gap-2">
            {scoreboard.map((row, index) => {
              const leading = index === 0 && row.wins > 0;
              return <li key={row.userId} className={cn("flex min-w-0 items-center gap-3 rounded-xl px-3 py-2", leading ? "bg-[var(--primary-soft)]" : "bg-[var(--surface-subtle)]")}>
                <span className={cn("w-5 shrink-0 text-center text-sm font-semibold", leading ? "text-[var(--primary)]" : "text-[var(--muted-foreground)]")}>{leading ? <Trophy className="mx-auto size-4" aria-label="Leading" /> : index + 1}</span>
                <PlayerAvatar userId={row.userId} name={row.displayName} size="sm" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">{row.displayName}</span>
                  {row.imposterRounds > 0 && <span className="block text-xs text-[var(--muted-foreground)]">{row.imposterWins}/{row.imposterRounds} won as imposter</span>}
                </span>
                <span className="shrink-0 text-sm font-semibold">{row.wins}<span className="font-normal text-[var(--muted-foreground)]">/{row.roundsPlayed}</span></span>
              </li>;
            })}
          </ol>
          <p className="mt-1 text-xs leading-5 text-[var(--muted-foreground)]">Rounds won out of rounds played, for this game only.</p>
        </CardContent>
      </Card>}
    </div>

    <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t pt-5">
      <form action={leaveGameRoom}>
        <input type="hidden" name="roomId" value={lobby.id} />
        <SubmitButton label="Leave game" pendingLabel="Leaving…" variant="ghost" size="sm" />
      </form>
      {lobby.isHost && <form action={endGameRoom}>
        <input type="hidden" name="roomId" value={lobby.id} />
        <ConfirmSubmit label="End game" confirmLabel="End for everyone?" detail="It ends for every player in the room, not just you." variant="outline" />
      </form>}
    </div>
  </>;
}
