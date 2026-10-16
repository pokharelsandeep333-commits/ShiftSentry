import { Crown, UserPlus } from "lucide-react";
import { PlayerAvatar } from "@/components/game/player-avatar";
import { KickPlayerButton } from "@/components/game/round-forms";
import { SeatName } from "@/components/game/seat-name";
import type { LobbyPlayer } from "@/lib/game-lobby";
import { MIN_PLAYERS_TO_START } from "@/lib/game";
import { cn } from "@/lib/utils";

/**
 * The lobby roster as tiles, plus a dashed tile for each seat still needed to
 * reach the minimum, so "2 / 10" stops reading as plenty.
 *
 * `min-w-0` on every tile and on the name box is load-bearing: a grid item and
 * a flex child both default to `min-width: auto`, and a nowrap name reports its
 * whole width as min-content, so without it a long name pushes the tile (and
 * the rename or Remove button) off a 320px screen instead of truncating.
 */
export function PlayerTiles({ roomId, players, viewerIsHost }: { roomId: string; players: LobbyPlayer[]; viewerIsHost: boolean }) {
  const missing = Math.max(0, MIN_PLAYERS_TO_START - players.length);

  // Columns by the card's width, not the viewport's: beside the setup card the
  // roster is narrow even on a laptop, and two forced columns hid the names.
  return <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,15rem),1fr))] gap-2 [&>*]:min-w-0">
    {players.map((player) => <li key={player.userId} className={cn(
      "flex min-w-0 items-center gap-3 rounded-2xl border py-2 pl-2.5 pr-1.5",
      player.isYou ? "border-[color-mix(in_srgb,var(--primary)_35%,var(--border))] bg-[var(--primary-soft)]" : "bg-[var(--card)]/45",
    )}>
      <PlayerAvatar userId={player.userId} name={player.displayName} present={player.present} />
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        {/* Your own tile carries the rename control, which draws the name and
            the "(you)" marker itself, outside the truncating span so a long
            name cannot clip the one thing saying which tile is yours. */}
        {player.isYou
          ? <SeatName roomId={roomId} displayName={player.displayName} />
          : <span className="min-w-0 flex-1 truncate py-1 text-sm font-semibold">{player.displayName}</span>}
      </div>
      <span className="sr-only">{player.present ? "Connected" : "Away"}</span>
      {player.isHost
        ? <span className="flex shrink-0 items-center gap-1 rounded-full bg-[var(--primary-soft)] px-2 py-0.5 text-xs font-semibold text-[var(--primary)]"><Crown className="size-3.5" aria-hidden="true" />Host</span>
        : viewerIsHost && <KickPlayerButton roomId={roomId} userId={player.userId} displayName={player.displayName} />}
    </li>)}
    {Array.from({ length: missing }, (_, index) => <li key={`open-${index}`} className="flex min-w-0 items-center gap-3 rounded-2xl border border-dashed py-2 pl-2.5 pr-3 text-sm text-[var(--muted-foreground)]">
      <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full border-2 border-dashed"><UserPlus className="size-4" /></span>
      Waiting for a player
    </li>)}
  </ul>;
}
