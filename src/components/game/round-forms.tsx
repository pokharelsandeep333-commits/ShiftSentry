"use client";

import { useActionState } from "react";
import { Check, Play } from "lucide-react";
import {
  finishGameRound,
  startGameRound,
  submitGameClue,
  submitGameFinalGuess,
  submitGameVote,
} from "@/app/actions/game";
import { emptyFormState } from "@/lib/form-state";
import { Button } from "@/components/ui/button";
import type { RoundSeat } from "@/lib/game-round";
import { cn } from "@/lib/utils";

function FormError({ message }: { message: string }) {
  if (!message) return null;
  return <p role="alert" className="rounded-xl border border-[color-mix(in_srgb,var(--danger)_35%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2.5 text-sm font-medium text-[var(--danger)]">{message}</p>;
}

export function StartRoundButton({ roomId, blocked }: { roomId: string; blocked: boolean }) {
  const [state, formAction, pending] = useActionState(startGameRound, emptyFormState);

  return <form action={formAction} className="grid gap-3">
    <input type="hidden" name="roomId" value={roomId} />
    <FormError message={state.message} />
    <Button type="submit" disabled={pending || blocked}>
      <Play className="size-4" />
      {pending ? "Dealing…" : "Start round"}
    </Button>
  </form>;
}

export function ClueForm({ roundId }: { roundId: string }) {
  const [state, formAction, pending] = useActionState(submitGameClue, emptyFormState);

  return <form action={formAction} className="grid gap-3">
    <input type="hidden" name="roundId" value={roundId} />
    <label className="field-label">
      <span>Your clue</span>
      <input
        name="clue"
        required
        maxLength={40}
        autoComplete="off"
        autoFocus
        placeholder="One word that fits — but not too well"
        className="field-control"
      />
    </label>
    <FormError message={state.message} />
    <Button type="submit" disabled={pending}>{pending ? "Sending…" : "Give clue"}</Button>
  </form>;
}

/**
 * One form, a button per candidate.
 *
 * The target rides on the submit button's own `name`/`value`, which is how a
 * form reports which button sent it -- so there is no selected-state to hold and
 * no second confirm step between deciding and voting.
 */
export function VotePanel({ roundId, seats, youHaveVoted }: { roundId: string; seats: RoundSeat[]; youHaveVoted: boolean }) {
  const [state, formAction, pending] = useActionState(submitGameVote, emptyFormState);
  const candidates = seats.filter((seat) => !seat.eliminated && !seat.isYou);

  return <form action={formAction} className="grid gap-3">
    <input type="hidden" name="roundId" value={roundId} />
    <p className="text-sm leading-6 text-[var(--muted-foreground)]">
      {youHaveVoted
        ? "Vote cast. You can change it until the last player votes."
        : "Who do you think it is?"}
    </p>
    <div className="grid gap-2">
      {candidates.map((seat) => <Button
        key={seat.userId}
        type="submit"
        name="targetId"
        value={seat.userId}
        variant="outline"
        disabled={pending}
        className="justify-between"
      >
        <span className="truncate">{seat.displayName}</span>
        {seat.hasLeft && <span className="text-xs font-normal text-[var(--muted-foreground)]">left</span>}
      </Button>)}
    </div>
    <FormError message={state.message} />
  </form>;
}

export function FinalGuessForm({ roundId }: { roundId: string }) {
  const [state, formAction, pending] = useActionState(submitGameFinalGuess, emptyFormState);

  return <form action={formAction} className="grid gap-3">
    <input type="hidden" name="roundId" value={roundId} />
    <label className="field-label">
      <span>Name the word</span>
      <input
        name="guess"
        required
        maxLength={40}
        autoComplete="off"
        autoFocus
        placeholder="Get it right and you still win"
        className="field-control"
      />
    </label>
    <FormError message={state.message} />
    <Button type="submit" disabled={pending}>{pending ? "Guessing…" : "Final guess"}</Button>
  </form>;
}

export function FinishRoundButton({ roundId }: { roundId: string }) {
  const [state, formAction, pending] = useActionState(finishGameRound, emptyFormState);

  return <form action={formAction} className="grid gap-3">
    <input type="hidden" name="roundId" value={roundId} />
    <FormError message={state.message} />
    <Button type="submit" disabled={pending}>
      <Check className="size-4" />
      {pending ? "Closing…" : "Back to the lobby"}
    </Button>
  </form>;
}

/** A seat in the turn order, used by the clue and voting screens. */
export function SeatRow({ seat, marker }: { seat: RoundSeat; marker?: "turn" | "voted" | "out" }) {
  return <div className={cn(
    "flex items-center gap-3 rounded-xl border px-3.5 py-2.5",
    marker === "turn" ? "border-[color-mix(in_srgb,var(--primary)_45%,var(--border))] bg-[var(--primary-soft)]" : "bg-[var(--card)]/45",
    marker === "out" && "opacity-55",
  )}>
    <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[var(--surface-subtle)] text-xs font-bold text-[var(--muted-foreground)]">{seat.turnOrder}</span>
    <span className="min-w-0 flex-1 truncate text-sm font-medium">
      {seat.displayName}
      {seat.isYou && <span className="ml-1.5 text-xs font-normal text-[var(--muted-foreground)]">(you)</span>}
    </span>
    {marker === "turn" && <span className="text-xs font-semibold text-[var(--primary)]">their turn</span>}
    {marker === "voted" && <Check className="size-4 text-[var(--success)]" />}
    {marker === "out" && <span className="text-xs font-semibold text-[var(--danger)]">voted out</span>}
    {seat.hasLeft && marker !== "out" && <span className="text-xs text-[var(--muted-foreground)]">left</span>}
  </div>;
}
