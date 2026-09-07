import { EyeOff, ShieldQuestion, Trophy, Users } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ClueForm, FinalGuessForm, FinishRoundButton, SeatRow, VotePanel } from "@/components/game/round-forms";
import type { RoundView } from "@/lib/game-round";
import { cn } from "@/lib/utils";

/**
 * The play screen. A server component: every value it renders was already
 * scoped by RLS or by a phase-gated function on the way in, so there is nothing
 * here to hide on the client -- what the page does not receive, it cannot leak.
 *
 * The forms underneath are the only client components, because they are the only
 * parts that need to submit.
 */

const PHASE_LABEL: Record<RoundView["status"], string> = {
  DEALING: "Dealing",
  CLUES: "Clues",
  VOTING: "Voting",
  GUESSING: "Final guess",
  REVEAL: "Reveal",
  ENDED: "Finished",
};

/**
 * What you are holding this round.
 *
 * The imposter is told they are the imposter, in both modes. In decoy mode the
 * classic game leaves you to work that out from the clues not quite matching,
 * which is a better game -- but the role sits on a row your own client is
 * allowed to read, so hiding it in the markup would be a curtain rather than a
 * wall. Told plainly is at least honest about what the app knows.
 */
function SecretCard({ round }: { round: RoundView }) {
  if (!round.yourRole) {
    return <Card className="border-dashed">
      <CardContent className="pt-5 text-center text-sm leading-6 text-[var(--muted-foreground)] sm:pt-6">
        You joined after this round was dealt, so you&rsquo;re sitting this one out. You&rsquo;ll be in the next.
      </CardContent>
    </Card>;
  }

  const isImposter = round.yourRole === "IMPOSTER";

  return <Card className={cn(
    "text-center",
    isImposter
      ? "border-[color-mix(in_srgb,var(--danger)_35%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_8%,transparent)]"
      : "border-[color-mix(in_srgb,var(--primary)_28%,var(--border))] bg-[var(--primary-soft)]",
  )}>
    <CardContent className="pt-5 sm:pt-6">
      <p className={cn(
        "text-xs font-bold uppercase tracking-[0.16em]",
        isImposter ? "text-[var(--danger)]" : "text-[var(--primary)]",
      )}>
        {isImposter ? "You are the imposter" : "Your word"}
      </p>

      {round.yourWord
        ? <p className="mt-2 font-display text-3xl font-semibold sm:text-4xl">{round.yourWord}</p>
        : <p className="mt-2 flex items-center justify-center gap-2 font-display text-2xl font-semibold text-[var(--muted-foreground)]">
            <EyeOff className="size-5" />
            No word
          </p>}

      {isImposter && round.yourWord && round.decoyMode && <p className="mt-2 text-xs text-[var(--muted-foreground)]">This is a decoy — close to the real word, but not it.</p>}
      {isImposter && round.yourCategoryHint && <p className="mt-2 text-sm text-[var(--muted-foreground)]">Category: <span className="font-semibold text-[var(--foreground)]">{round.yourCategoryHint}</span></p>}
      {isImposter && !round.yourWord && !round.yourCategoryHint && <p className="mt-2 text-xs text-[var(--muted-foreground)]">Bluff it. Listen first if you can.</p>}
    </CardContent>
  </Card>;
}

function ClueList({ round }: { round: RoundView }) {
  if (!round.clues.length) return null;

  const passes = Array.from(new Set(round.clues.map((clue) => clue.passNo))).sort((a, b) => a - b);

  return <Card>
    <CardHeader><CardTitle>Clues</CardTitle></CardHeader>
    <CardContent className="grid gap-4">
      {passes.map((pass) => <div key={pass} className="grid gap-2">
        {round.cluePasses > 1 && <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Pass {pass}</p>}
        {round.clues.filter((clue) => clue.passNo === pass).map((clue) => <div key={`${clue.userId}-${clue.passNo}`} className="flex items-baseline gap-3 rounded-xl bg-[var(--surface-subtle)] px-3.5 py-2.5">
          <span className="shrink-0 text-xs font-semibold text-[var(--muted-foreground)]">{clue.displayName}</span>
          <span className="min-w-0 flex-1 break-words text-sm font-medium">{clue.clue}</span>
        </div>)}
      </div>)}
    </CardContent>
  </Card>;
}

function Reveal({ round }: { round: RoundView }) {
  if (!round.reveal) return null;

  const crewWon = round.outcome === "CREW_WIN";
  const imposters = round.seats.filter((seat) => round.reveal!.imposterIds.includes(seat.userId));
  const caught = round.seats.find((seat) => seat.userId === round.caughtUserId);

  const tally = new Map<string, number>();
  for (const vote of round.votes) tally.set(vote.targetId, (tally.get(vote.targetId) ?? 0) + 1);

  return <Card className={cn(
    crewWon
      ? "border-[color-mix(in_srgb,var(--success)_35%,var(--border))]"
      : "border-[color-mix(in_srgb,var(--danger)_35%,var(--border))]",
  )}>
    <CardContent className="grid gap-4 pt-5 sm:pt-6">
      <div className="text-center">
        <Trophy className={cn("mx-auto size-7", crewWon ? "text-[var(--success)]" : "text-[var(--danger)]")} />
        <p className="mt-2 font-display text-2xl font-semibold">{crewWon ? "The crew win" : "The imposter wins"}</p>
        <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
          The word was <span className="font-semibold text-[var(--foreground)]">{round.reveal.word}</span>
          {round.decoyMode && <> · the decoy was <span className="font-semibold text-[var(--foreground)]">{round.reveal.decoyWord}</span></>}
          {" "}({round.reveal.category})
        </p>
      </div>

      <div className="grid gap-2 border-t pt-4">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">
          {imposters.length === 1 ? "The imposter" : "The imposters"}
        </p>
        {imposters.map((seat) => <p key={seat.userId} className="text-sm font-semibold">{seat.displayName}{seat.isYou && " (you)"}</p>)}

        {caught
          ? <p className="mt-1 text-sm text-[var(--muted-foreground)]">Voted out: {caught.displayName}</p>
          : <p className="mt-1 text-sm text-[var(--muted-foreground)]">The vote tied, so nobody went out.</p>}

        {round.finalGuess && <p className="text-sm text-[var(--muted-foreground)]">
          Final guess: <span className="font-semibold text-[var(--foreground)]">{round.finalGuess}</span>
          {round.outcome === "IMPOSTER_WIN" ? " — right" : " — wrong"}
        </p>}
      </div>

      <div className="grid gap-1.5 border-t pt-4">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Votes</p>
        {round.seats.filter((seat) => (tally.get(seat.userId) ?? 0) > 0).map((seat) => <p key={seat.userId} className="text-sm text-[var(--muted-foreground)]">
          <span className="font-medium text-[var(--foreground)]">{seat.displayName}</span> — {tally.get(seat.userId)} vote{tally.get(seat.userId) === 1 ? "" : "s"}
          {" "}({round.votes.filter((vote) => vote.targetId === seat.userId).map((vote) => round.seats.find((other) => other.userId === vote.voterId)?.displayName ?? "?").join(", ")})
        </p>)}
      </div>
    </CardContent>
  </Card>;
}

export function RoundBoard({ round, isHost }: { round: RoundView; isHost: boolean }) {
  const turnSeat = round.seats.find((seat) => seat.isTurn);
  const waitingOn = round.seats.filter((seat) => !seat.eliminated && !seat.hasLeft && !seat.hasVoted);
  const caught = round.seats.find((seat) => seat.userId === round.caughtUserId);

  return <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
    <div className="grid gap-6 self-start">
      <SecretCard round={round} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Users className="size-4 text-[var(--primary)]" />
            Round {round.roundNo}
            <span className="ml-auto text-sm font-normal text-[var(--muted-foreground)]">
              {PHASE_LABEL[round.status]}
              {round.status === "CLUES" && round.cluePasses > 1 && ` · pass ${round.currentPass}/${round.cluePasses}`}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent className="grid gap-2">
          {round.seats.map((seat) => <SeatRow
            key={seat.userId}
            seat={seat}
            marker={
              seat.eliminated ? "out"
              : round.status === "CLUES" && seat.isTurn ? "turn"
              : round.status === "VOTING" && seat.hasVoted ? "voted"
              : undefined
            }
          />)}
        </CardContent>
      </Card>
    </div>

    <div className="grid gap-6 self-start">
      {round.status === "CLUES" && <Card>
        <CardHeader><CardTitle>{round.isYourTurn ? "Your turn" : "Clue phase"}</CardTitle></CardHeader>
        <CardContent>
          {round.isYourTurn
            ? <ClueForm roundId={round.id} />
            : <p className="text-sm leading-6 text-[var(--muted-foreground)]">
                {turnSeat ? <>Waiting on <span className="font-semibold text-[var(--foreground)]">{turnSeat.displayName}</span>.</> : "Wrapping up this pass…"}
              </p>}
        </CardContent>
      </Card>}

      {round.status === "VOTING" && <Card>
        <CardHeader><CardTitle>Vote</CardTitle></CardHeader>
        <CardContent className="grid gap-3">
          {round.yourRole
            ? <VotePanel roundId={round.id} seats={round.seats} youHaveVoted={round.youHaveVoted} />
            : <p className="text-sm leading-6 text-[var(--muted-foreground)]">You&rsquo;re not playing this round, so you don&rsquo;t get a vote.</p>}
          {waitingOn.length > 0 && <p className="border-t pt-3 text-xs text-[var(--muted-foreground)]">Still to vote: {waitingOn.map((seat) => seat.displayName).join(", ")}</p>}
        </CardContent>
      </Card>}

      {round.status === "GUESSING" && <Card className="border-[color-mix(in_srgb,var(--primary)_35%,var(--border))]">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldQuestion className="size-4 text-[var(--primary)]" />Caught — one last chance</CardTitle>
        </CardHeader>
        <CardContent>
          {round.awaitingYourGuess
            ? <div className="grid gap-3">
                <p className="text-sm leading-6 text-[var(--muted-foreground)]">They got you. Name the word and you still take the round.</p>
                <FinalGuessForm roundId={round.id} />
              </div>
            : <p className="text-sm leading-6 text-[var(--muted-foreground)]">
                <span className="font-semibold text-[var(--foreground)]">{caught?.displayName ?? "The imposter"}</span> was voted out and is naming the word. Get it right and they steal it.
              </p>}
        </CardContent>
      </Card>}

      {(round.status === "REVEAL" || round.status === "ENDED") && <>
        <Reveal round={round} />
        {isHost
          ? <FinishRoundButton roundId={round.id} />
          : <p className="text-center text-xs text-[var(--muted-foreground)]">Waiting for the host to start the next round.</p>}
      </>}

      <ClueList round={round} />
    </div>
  </div>;
}
