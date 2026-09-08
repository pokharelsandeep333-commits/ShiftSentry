"use client";

import { useActionState } from "react";
import { Check, Dices, DoorOpen, Play, Vote } from "lucide-react";
import {
  abandonGameRound,
  finishGameRound,
  kickGamePlayer,
  openGameRoundVote,
  rerollGameWord,
  startGameRound,
  submitGameClue,
  submitGameFinalGuess,
  submitGameVote,
} from "@/app/actions/game";
import { emptyFormState } from "@/lib/form-state";
import { Button } from "@/components/ui/button";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
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
export function VotePanel({
  roundId, seats, yourVoteTargetId,
}: {
  roundId: string; seats: RoundSeat[]; yourVoteTargetId: string | null;
}) {
  const [state, formAction, pending] = useActionState(submitGameVote, emptyFormState);
  const candidates = seats.filter((seat) => !seat.eliminated && !seat.isYou);

  return <form action={formAction} className="grid gap-3">
    <input type="hidden" name="roundId" value={roundId} />
    <p className="text-sm leading-6 text-[var(--muted-foreground)]">
      {yourVoteTargetId
        ? "Your vote is in. You can change it until the last player votes."
        : "Who do you think it is?"}
    </p>
    <div className="grid gap-2">
      {candidates.map((seat) => {
        const chosen = seat.userId === yourVoteTargetId;
        return <button
          key={seat.userId}
          type="submit"
          name="targetId"
          value={seat.userId}
          disabled={pending}
          aria-pressed={chosen}
          className={cn(
            // `w-full min-w-0` on the button, not just the span inside it. The
            // button is the grid item here, and a grid item defaults to
            // min-width:auto -- so with a nowrap name it sized to 296px inside a
            // 288px cell and spilled out, no matter what the span was told.
            "flex h-11 w-full min-w-0 items-center justify-between gap-2 rounded-xl border px-4 text-sm font-semibold transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--primary-soft)]",
            chosen
              ? "border-[var(--primary)] bg-[var(--primary)] text-[var(--primary-foreground)] shadow-lg shadow-[var(--primary-glow)]"
              : "bg-[var(--card)]/45 hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--primary)_35%,var(--border))] hover:bg-[var(--primary-soft)]",
          )}
        >
          {/* `min-w-0 flex-1` or `truncate` is inert: a flex child defaults to
              min-width:auto and nowrap text reports its whole width as
              min-content, so a long name widens the button instead of
              ellipsing inside it. */}
          <span className="min-w-0 flex-1 truncate text-left">{seat.displayName}</span>
          <span className="flex shrink-0 items-center gap-2">
            {seat.hasLeft && <span className="text-xs font-normal opacity-70">left</span>}
            {chosen && <><span className="text-xs font-normal">your vote</span><Vote className="size-4" /></>}
          </span>
        </button>;
      })}
    </div>
    <FormError message={state.message} />
  </form>;
}

export function OpenVoteButton({ roundId }: { roundId: string }) {
  const [state, formAction, pending] = useActionState(openGameRoundVote, emptyFormState);

  return <form action={formAction} className="grid gap-3">
    <input type="hidden" name="roundId" value={roundId} />
    <FormError message={state.message} />
    <Button type="submit" disabled={pending}>
      <Vote className="size-4" />
      {pending ? "Opening…" : "Open the vote"}
    </Button>
  </form>;
}

export function RerollWordButton({ roundId }: { roundId: string }) {
  const [state, formAction, pending] = useActionState(rerollGameWord, emptyFormState);

  return <form action={formAction} className="grid gap-2">
    <input type="hidden" name="roundId" value={roundId} />
    <FormError message={state.message} />
    <Button type="submit" variant="outline" size="sm" disabled={pending}>
      <Dices className="size-3.5" />
      {pending ? "Swapping…" : "Different word"}
    </Button>
  </form>;
}

export function KickPlayerButton({ roomId, userId, displayName }: { roomId: string; userId: string; displayName: string }) {
  const [state, formAction, pending] = useActionState(kickGamePlayer, emptyFormState);

  return <form action={formAction} title={state.message || undefined}>
    <input type="hidden" name="roomId" value={roomId} />
    <input type="hidden" name="userId" value={userId} />
    <Button
      type="submit"
      variant="ghost"
      size="sm"
      disabled={pending}
      aria-label={`Remove ${displayName} from the game`}
      className="text-[var(--muted-foreground)] hover:text-[var(--danger)]"
    >
      Remove
    </Button>
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

/**
 * The host's way out of a round that is no longer worth finishing.
 *
 * Two-step, like every other control that acts on everybody else: a stray tap
 * here would wipe a live round, and the phone-sized target sits a few
 * millimetres from the clue box.
 */
export function AbandonRoundButton({ roundId }: { roundId: string }) {
  const [state, formAction] = useActionState(abandonGameRound, emptyFormState);

  return <form action={formAction} className="grid gap-2.5">
    <input type="hidden" name="roundId" value={roundId} />
    <FormError message={state.message} />
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <p className="min-w-0 flex-1 basis-40 text-xs leading-5 text-[var(--muted-foreground)]">
        Ends this round for everyone and reopens the lobby, so you can change the settings before the next one.
      </p>
      <span className="flex items-center gap-1.5">
        <DoorOpen aria-hidden className="size-3.5 shrink-0 text-[var(--muted-foreground)]" />
        <ConfirmSubmit label="Back to lobby" confirmLabel="End this round?" variant="outline" />
      </span>
    </div>
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
    <span className="min-w-0 flex-1 truncate text-sm font-medium">{seat.displayName}</span>
    {/* Outside the truncating span, not inside it. `truncate` clips its
        overflow, so a long enough name would hide the one marker telling you
        which row is yours. */}
    {seat.isYou && <span className="shrink-0 text-xs font-normal text-[var(--muted-foreground)]">(you)</span>}
    {marker === "turn" && <span className="text-xs font-semibold text-[var(--primary)]">their turn</span>}
    {marker === "voted" && <Check className="size-4 text-[var(--success)]" />}
    {marker === "out" && <span className="text-xs font-semibold text-[var(--danger)]">voted out</span>}
    {seat.hasLeft && marker !== "out" && <span className="text-xs text-[var(--muted-foreground)]">left</span>}
  </div>;
}
