import Link from "next/link";
import { Crown, Gamepad2 } from "lucide-react";
import { formatDistanceStrict } from "date-fns";
import { PageHeader } from "@/components/page-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { PlayerAvatar } from "@/components/game/player-avatar";
import { ModerationButton } from "@/components/admin/moderation-button";
import type { ModerationRoom } from "@/lib/admin-games";

const PHASE: Record<string, string> = { DEALING: "Dealing", CLUES: "Clues", DISCUSSION: "Talking", VOTING: "Voting", GUESSING: "Final guess", REVEAL: "Reveal", ENDED: "Between rounds" };

function phaseOf(room: ModerationRoom) {
  if (room.status === "LOBBY") return { label: "In lobby", variant: "muted" as const };
  return { label: room.roundStatus ? PHASE[room.roundStatus] ?? room.roundStatus : "Playing", variant: "default" as const };
}

/**
 * Live Imposter rooms for moderation. Names and seats only: nothing from inside
 * a round is loaded. Each seat links to its account, so an admin can go from
 * an abusive name to disabling the account behind it.
 */
export function GamesView({ rooms, now }: { rooms: ModerationRoom[]; now: Date }) {
  return <>
    <PageHeader title="Games" description="Live Imposter rooms. Reset a name or remove a player who breaks the Terms' acceptable-use rules, or end a room. Every action is in the audit log." />

    {rooms.length ? <ul className="grid gap-4 xl:grid-cols-2 [&>*]:min-w-0">
      {rooms.map((room) => {
        const phase = phaseOf(room);
        return <li key={room.id}>
          <Card className="h-full">
            <CardContent className="grid gap-4 pt-5 sm:pt-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2 font-display text-lg font-semibold tracking-[0.12em]">{room.code}<Badge variant={phase.variant}>{phase.label}</Badge></div>
                  <p className="mt-1 text-xs text-[var(--muted-foreground)]">{room.seats.length} player{room.seats.length === 1 ? "" : "s"} · started {formatDistanceStrict(room.createdAt, now, { addSuffix: true })}</p>
                </div>
                <ModerationButton kind="end" roomId={room.id} code={room.code} label="End room" question={`End room ${room.code}?`} detail="It ends for everyone in it, and any round in play is closed. It can't be reopened." />
              </div>

              <ul className="grid gap-1.5 border-t pt-4">
                {room.seats.map((seat) => <li key={seat.userId} className="flex min-w-0 items-center gap-3 rounded-xl px-2 py-1.5 hover:bg-[var(--surface-subtle)]">
                  <PlayerAvatar userId={seat.userId} name={seat.name} present={seat.present} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <span className="truncate text-sm font-semibold">{seat.name}</span>
                      {seat.userId === room.hostId && <Crown className="size-3.5 shrink-0 text-[var(--primary)]" aria-label="Host" />}
                    </span>
                    {seat.email ? <Link href={`/admin/users/${seat.userId}`} className="block truncate text-xs text-[var(--muted-foreground)] underline-offset-4 hover:text-[var(--primary)] hover:underline">{seat.email}</Link> : <span className="block text-xs text-[var(--muted-foreground)]">Deleted account</span>}
                  </span>
                  <span className="flex shrink-0 items-center">
                    <ModerationButton kind="reset" roomId={room.id} code={room.code} userId={seat.userId} label="Reset name" question={`Reset "${seat.name}"?`} detail="Their name in this room becomes Player N. They can rename again; disable the account if it keeps happening." />
                    <ModerationButton kind="remove" roomId={room.id} code={room.code} userId={seat.userId} label="Remove" question={`Remove ${seat.name} from ${room.code}?`} detail={seat.userId === room.hostId ? "They leave the room and the host role passes to another player. Their turn and votes are settled so the round can go on." : "They leave the room. Their turn and votes are settled so the round can go on. They could rejoin with the code."} />
                  </span>
                </li>)}
              </ul>
            </CardContent>
          </Card>
        </li>;
      })}
    </ul> : <Card><CardContent className="grid justify-items-center gap-3 py-12 text-center">
      <span className="grid size-12 place-items-center rounded-2xl bg-[var(--primary-soft)] text-[var(--primary)]"><Gamepad2 className="size-6" aria-hidden="true" /></span>
      <p className="text-sm text-[var(--muted-foreground)]">No live rooms right now.</p>
    </CardContent></Card>}
  </>;
}
