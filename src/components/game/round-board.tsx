import type { ReactNode } from "react";
import { EyeOff, MessagesSquare, Scale, Siren, Trophy, Users, Vote, Wrench } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PhaseTracker } from "@/components/game/phase-tracker";
import { PlayerAvatar } from "@/components/game/player-avatar";
import {
  AbandonRoundButton,
  ClueForm,
  FinalGuessForm,
  FinishRoundButton,
  OpenVoteButton,
  RerollWordButton,
  SeatRow,
  VotePanel,
} from "@/components/game/round-forms";
import type { RoundSeat, RoundView } from "@/lib/game-round";
import { cn } from "@/lib/utils";

/**
 * The play screen. A server component: every value it renders was already
 * scoped by RLS or by a phase-gated function on the way in, so there is nothing
 * here to hide on the client -- what the page does not receive, it cannot leak.
 *
 * `yourRole` being null on a hidden-role round is the clearest example. It is
 * not blanked here; `game_my_round_secret` refuses to return it, so it never
 * reaches the server render either.
 *
 * Nothing outside the secret card may look different for an imposter. Player
 * colours come from `playerColor(userId)` alone, and the "Your move" card is
 * the same card whoever is holding the phone.
 */

function SecretCard({ round }: { round: RoundView }) {
  if (!round.yourRole && !round.yourWord && !round.rolesHidden) {
    return <Card className="border-dashed">
      <CardContent className="pt-5 text-center text-sm leading-6 text-[var(--muted-foreground)] sm:pt-6">
        You joined after this round was dealt, so you&rsquo;re sitting this one out. You&rsquo;ll be in the next.
      </CardContent>
    </Card>;
  }

  // Roles hidden: everyone holds a word and nobody is told whose is the odd one.
  // Deliberately styled the same for every player -- a different colour for the
  // imposter would give away the thing the round is hiding.
  if (round.rolesHidden && !round.yourRole) {
    return <Card className="border-[color-mix(in_srgb,var(--primary)_28%,var(--border))] bg-[var(--primary-soft)] text-center">
      <CardContent className="pt-5 sm:pt-6">
        <p className="text-sm font-semibold text-[var(--primary)]">Your word</p>
        <p className="mt-2 font-display text-3xl font-semibold sm:text-4xl">{round.yourWord}</p>
        <p className="mt-3 text-xs leading-5 text-[var(--muted-foreground)]">
          Roles are hidden. Someone here has a slightly different word. It might be you.
        </p>
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
        "text-sm font-semibold",
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

      {isImposter && round.yourWord && round.imposterHint === "DECOY" && <p className="mt-2 text-xs text-[var(--muted-foreground)]">This is a decoy: close to the real word, but not it.</p>}
      {isImposter && round.yourCategoryHint && <p className="mt-2 text-sm text-[var(--muted-foreground)]">
        {round.imposterHint === "RELATED" ? "Something in the same area:" : "Category:"}{" "}
        <span className="font-semibold text-[var(--foreground)]">{round.yourCategoryHint}</span>
      </p>}
      {isImposter && !round.yourWord && !round.yourCategoryHint && <p className="mt-2 text-xs text-[var(--muted-foreground)]">Bluff it. Listen first if you can.</p>}
    </CardContent>
  </Card>;
}

/**
 * The card for what this phase wants. Marked "Your move" when it is waiting on
 * you and plain when it is waiting on someone else, so a glance at the screen
 * answers "do I need to do something?".
 */
function MoveCard({ title, icon, yourMove, children }: { title: string; icon?: ReactNode; yourMove: boolean; children: ReactNode }) {
  return <Card className={cn(yourMove && "border-[color-mix(in_srgb,var(--primary)_45%,var(--border))] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--primary)_10%,var(--card)),var(--card)_70%)] shadow-lg shadow-[var(--primary-glow)]")}>
    <CardHeader>
      {yourMove && <span className="mb-1 w-fit rounded-full bg-[var(--primary)] px-2.5 py-0.5 text-xs font-bold text-[var(--primary-foreground)]">Your move</span>}
      <CardTitle className="flex items-center gap-2">{icon}{title}</CardTitle>
    </CardHeader>
    <CardContent className="grid gap-3">{children}</CardContent>
  </Card>;
}

/** "Waiting on Sam", with Sam's colour, so the room knows whose phone to look at. */
function WaitingOn({ seat, before }: { seat: RoundSeat | undefined; before?: string }) {
  if (!seat) return <p className="text-sm leading-6 text-[var(--muted-foreground)]">Wrapping up this pass…</p>;
  return <p className="flex min-w-0 items-center gap-2.5 rounded-xl bg-[var(--surface-subtle)] px-3 py-2.5 text-sm text-[var(--muted-foreground)]">
    <PlayerAvatar userId={seat.userId} name={seat.displayName} size="sm" />
    <span className="min-w-0 flex-1">{before ? `${before} ` : ""}Waiting on <span className="font-semibold text-[var(--foreground)]">{seat.displayName}</span>.</span>
    <span className="size-2 shrink-0 animate-pulse rounded-full bg-[var(--primary)]" aria-hidden="true" />
  </p>;
}

/** A small name chip with the player's colour, for "still to vote" and "voted by". */
function PlayerChip({ seat }: { seat: RoundSeat }) {
  return <span className="flex min-w-0 max-w-full items-center gap-1 rounded-full bg-[var(--surface-subtle)] py-0.5 pl-0.5 pr-2 text-xs">
    <PlayerAvatar userId={seat.userId} name={seat.displayName} size="sm" className="size-5 text-[0.6rem]" />
    <span className="min-w-0 truncate">{seat.displayName}</span>
  </span>;
}

function ClueList({ round }: { round: RoundView }) {
  if (!round.clues.length) return null;

  const passes = Array.from(new Set(round.clues.map((clue) => clue.passNo))).sort((a, b) => a - b);

  return <Card>
    <CardHeader><CardTitle>Clues</CardTitle></CardHeader>
    <CardContent className="grid gap-4">
      {passes.map((pass) => <div key={pass} className="grid gap-2">
        {passes.length > 1 && <p className="text-xs font-semibold text-[var(--muted-foreground)]">Pass {pass}</p>}
        {round.clues.filter((clue) => clue.passNo === pass).map((clue) => <div key={`${clue.userId}-${clue.passNo}`} className="flex min-w-0 items-center gap-2.5 rounded-xl bg-[var(--surface-subtle)] px-3 py-2">
          <PlayerAvatar userId={clue.userId} name={clue.displayName} size="sm" />
          {/* The clue wraps rather than truncating: it is the thing being read. */}
          <span className="min-w-0 flex-1">
            <span className="block truncate text-xs font-semibold text-[var(--muted-foreground)]">{clue.displayName}</span>
            <span className="block break-words text-sm font-semibold">{clue.clue}</span>
          </span>
        </div>)}
      </div>)}
    </CardContent>
  </Card>;
}

function Reveal({ round }: { round: RoundView }) {
  if (!round.reveal) return null;
  const { imposterIds } = round.reveal;

  const crewWon = round.outcome === "CREW_WIN";
  const imposters = round.seats.filter((seat) => imposterIds.includes(seat.userId));
  const caught = round.seats.find((seat) => seat.userId === round.caughtUserId);
  const you = round.seats.find((seat) => seat.isYou);
  // Null for someone who sat the round out: they neither won nor lost it.
  const youWon = you ? (imposterIds.includes(you.userId) ? !crewWon : crewWon) : null;

  const tally = new Map<string, number>();
  for (const vote of round.votes) tally.set(vote.targetId, (tally.get(vote.targetId) ?? 0) + 1);
  const voted = round.seats
    .filter((seat) => (tally.get(seat.userId) ?? 0) > 0)
    .sort((a, b) => (tally.get(b.userId) ?? 0) - (tally.get(a.userId) ?? 0));
  const most = Math.max(1, ...voted.map((seat) => tally.get(seat.userId) ?? 0));

  return <Card className={cn("overflow-hidden", crewWon ? "border-[color-mix(in_srgb,var(--success)_40%,var(--border))]" : "border-[color-mix(in_srgb,var(--danger)_40%,var(--border))]")}>
    <div className={cn("px-5 py-7 text-center sm:px-6", crewWon ? "bg-[linear-gradient(160deg,color-mix(in_srgb,var(--success)_18%,var(--card)),var(--card))]" : "bg-[linear-gradient(160deg,color-mix(in_srgb,var(--danger)_16%,var(--card)),var(--card))]")}>
      <span className={cn("mx-auto grid size-14 place-items-center rounded-2xl text-white shadow-lg", crewWon ? "bg-[var(--success)]" : "bg-[var(--danger)]")}><Trophy className="size-7" aria-hidden="true" /></span>
      <p className="mt-3 font-display text-3xl font-semibold">{crewWon ? "The crew win" : imposters.length > 1 ? "The imposters win" : "The imposter wins"}</p>
      {youWon !== null && <p className={cn("mt-1 text-sm font-semibold", youWon ? "text-[var(--success)]" : "text-[var(--danger)]")}>{youWon ? "You won this round" : "You lost this round"}</p>}
      <div className="mx-auto mt-5 w-fit max-w-full rounded-2xl border bg-[var(--card)] px-6 py-3">
        <p className="text-xs font-semibold text-[var(--muted-foreground)]">The word was</p>
        <p className="break-words font-display text-2xl font-semibold">{round.reveal.word}</p>
        <p className="text-xs text-[var(--muted-foreground)]">
          {round.reveal.category}
          {round.imposterHint === "DECOY" && <> · decoy: <span className="font-semibold text-[var(--foreground)]">{round.reveal.decoyWord}</span></>}
        </p>
      </div>
    </div>

    <CardContent className="grid gap-5 pt-5 sm:pt-6">
      <div className="grid gap-2">
        <p className="text-xs font-semibold text-[var(--muted-foreground)]">{imposters.length === 1 ? "The imposter" : "The imposters"}</p>
        <div className="flex flex-wrap gap-2">
          {imposters.map((seat) => <span key={seat.userId} className="flex min-w-0 max-w-full items-center gap-2 rounded-full border border-[color-mix(in_srgb,var(--danger)_35%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_8%,transparent)] py-1 pl-1 pr-3 text-sm font-semibold">
            <PlayerAvatar userId={seat.userId} name={seat.displayName} size="sm" />
            <span className="min-w-0 truncate">{seat.displayName}</span>
            {seat.isYou && <span className="shrink-0 text-xs font-normal text-[var(--muted-foreground)]">(you)</span>}
          </span>)}
        </div>
        <div className="grid gap-1 text-sm text-[var(--muted-foreground)]">
          <p>{caught ? <>Voted out: <span className="font-semibold text-[var(--foreground)]">{caught.displayName}</span></> : "The vote tied again, so nobody went out."}</p>
          {round.tiebreakCount > 0 && <p>Went to {round.tiebreakCount === 1 ? "a tiebreak" : `${round.tiebreakCount} tiebreaks`}, so {round.tiebreakCount === 1 ? "one extra clue" : `${round.tiebreakCount} extra clues`} each.</p>}
          {round.finalGuess && <p>Final guess: <span className="font-semibold text-[var(--foreground)]">{round.finalGuess}</span> {round.outcome === "IMPOSTER_WIN" ? "(right)" : "(wrong)"}</p>}
        </div>
      </div>

      {voted.length > 0 && <div className="grid gap-4 border-t pt-5">
        <p className="text-xs font-semibold text-[var(--muted-foreground)]">Votes</p>
        {voted.map((seat) => {
          const count = tally.get(seat.userId) ?? 0;
          const isImposter = imposterIds.includes(seat.userId);
          const voters = round.votes
            .filter((vote) => vote.targetId === seat.userId)
            .map((vote) => round.seats.find((other) => other.userId === vote.voterId))
            .filter((other): other is RoundSeat => Boolean(other));
          return <div key={seat.userId} className="grid gap-1.5">
            <div className="flex min-w-0 items-center justify-between gap-3 text-sm">
              <span className="min-w-0 truncate font-semibold">
                {seat.displayName}
                {isImposter && <span className="ml-1.5 text-xs font-semibold text-[var(--danger)]">imposter</span>}
              </span>
              <span className="shrink-0 tabular-nums text-[var(--muted-foreground)]">{count} vote{count === 1 ? "" : "s"}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-[var(--muted)]" aria-hidden="true">
              <div className={cn("h-full rounded-full", isImposter ? "bg-[var(--danger)]" : "bg-[var(--primary)]")} style={{ width: `${(count / most) * 100}%` }} />
            </div>
            <div className="flex flex-wrap items-center gap-1 text-[var(--muted-foreground)]">
              <span className="sr-only">Voted by</span>
              {voters.map((voter) => <PlayerChip key={voter.userId} seat={voter} />)}
            </div>
          </div>;
        })}
      </div>}
    </CardContent>
  </Card>;
}

export function RoundBoard({ round, isHost }: { round: RoundView; isHost: boolean }) {
  const turnSeat = round.seats.find((seat) => seat.isTurn);
  const you = round.seats.find((seat) => seat.isYou);
  const waitingOn = round.seats.filter((seat) => !seat.eliminated && !seat.hasLeft && !seat.hasVoted);
  const caught = round.seats.find((seat) => seat.userId === round.caughtUserId);
  const nobodyHasSpoken = round.clues.length === 0;
  // Only players seated this round get a vote: the same gate as the page's turn prompt.
  const seated = Boolean(round.yourRole || round.rolesHidden || round.yourWord);
  const youCluedThisPass = you ? round.clues.some((clue) => clue.userId === you.userId && clue.passNo === round.currentPass) : false;
  const live = round.status !== "REVEAL" && round.status !== "ENDED";
  const yourVote = seated && !round.youHaveVoted;

  // Each player's clues, for the vote buttons. Clues are already public to the
  // room (they are the list on the right), so this shows nothing new.
  const cluesBy: Record<string, string[]> = {};
  for (const clue of round.clues) (cluesBy[clue.userId] ??= []).push(clue.clue);

  // Columns are split by urgency rather than by kind, because on a phone this
  // grid collapses to one column and the order becomes the reading order. What
  // you are holding and what you have to do next come first; who is playing and
  // what has been said follow.
  return <>
    <PhaseTracker round={round} />
    <div className="grid gap-6 lg:grid-cols-[0.95fr_1.05fr]">
      {/* `min-w-0` on the columns is load-bearing, not decorative. A grid item
          defaults to `min-width: auto`, which means it refuses to shrink below
          its content's min-content width -- and `truncate` sets `white-space:
          nowrap`, whose min-content is the *entire* string. So a long player
          name forced the column wider than a 320px screen. Letting the column
          reach zero is what hands control back to `truncate`. */}
      <div className="grid min-w-0 gap-6 self-start [&>*]:min-w-0">
        <SecretCard round={round} />

        {round.status === "CLUES" && <MoveCard
          yourMove={round.isYourTurn}
          icon={round.isTiebreak ? <Scale className="size-4 text-[var(--primary)]" aria-hidden="true" /> : undefined}
          title={round.isYourTurn ? "Give your clue" : round.isTiebreak ? "Tiebreak" : "Clues"}
        >
          {round.isTiebreak && <p className="rounded-xl bg-[var(--primary-soft)] px-3 py-2.5 text-sm leading-5 text-[var(--primary)]">
            The vote tied, so nobody went out. One more clue each, and it has to be something nobody has said yet.
          </p>}
          {round.isYourTurn
            ? <ClueForm roundId={round.id} />
            : <WaitingOn seat={turnSeat} before={youCluedThisPass ? "Your clue is in." : undefined} />}
        </MoveCard>}

        {round.status === "DISCUSSION" && <MoveCard yourMove={isHost} icon={<MessagesSquare className="size-4 text-[var(--primary)]" aria-hidden="true" />} title="Talk it over">
          <p className="text-sm leading-6 text-[var(--muted-foreground)]">All the clues are in. Say what you think before anyone commits. Voting is locked until the host opens it.</p>
          {isHost
            ? <OpenVoteButton roundId={round.id} />
            : <p className="text-center text-xs text-[var(--muted-foreground)]">The host opens the vote when everyone&rsquo;s had their say.</p>}
        </MoveCard>}

        {round.status === "VOTING" && <MoveCard yourMove={yourVote} icon={<Vote className="size-4 text-[var(--primary)]" aria-hidden="true" />} title={yourVote ? "Who is the imposter?" : "Vote"}>
          {seated
            ? <VotePanel roundId={round.id} seats={round.seats} yourVoteTargetId={round.yourVoteTargetId} cluesBy={cluesBy} />
            : <p className="text-sm leading-6 text-[var(--muted-foreground)]">You&rsquo;re not playing this round, so you don&rsquo;t get a vote.</p>}
          {waitingOn.length > 0 && <div className="flex flex-wrap items-center gap-1.5 border-t pt-3 text-xs text-[var(--muted-foreground)]">
            Still to vote:
            {waitingOn.map((seat) => <PlayerChip key={seat.userId} seat={seat} />)}
          </div>}
        </MoveCard>}

        {/* The loudest moment in the game: reaching this phase already tells the
            room the vote landed on an imposter, so say it plainly and make the
            stakes obvious. */}
        {round.status === "GUESSING" && <Card className="border-[color-mix(in_srgb,var(--danger)_45%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_8%,transparent)]">
          <CardContent className="grid gap-4 pt-5 sm:pt-6">
            <div className="text-center">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--danger)] px-3 py-1 text-xs font-bold text-white">
                <Siren className="size-3.5" />
                Caught
              </span>
              {caught && <PlayerAvatar userId={caught.userId} name={caught.displayName} className="mx-auto mt-3" />}
              <p className="mt-3 font-display text-2xl font-semibold sm:text-3xl">
                {caught?.isYou ? "You were the imposter" : `${caught?.displayName ?? "The imposter"} was the imposter`}
              </p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">
                Voted out, but it isn&rsquo;t over. One guess at the word, and the round flips.
              </p>
            </div>

            {round.awaitingYourGuess
              ? <div className="grid gap-3 border-t pt-4">
                  <span className="mx-auto w-fit rounded-full bg-[var(--danger)] px-2.5 py-0.5 text-xs font-bold text-white">Your move</span>
                  <p className="text-center text-sm font-semibold">Name the word and you take it.</p>
                  <FinalGuessForm roundId={round.id} />
                </div>
              : <p className="border-t pt-4 text-center text-sm leading-6 text-[var(--muted-foreground)]">
                  Waiting for <span className="font-semibold text-[var(--foreground)]">{caught?.displayName ?? "them"}</span> to guess.
                </p>}
          </CardContent>
        </Card>}

        {!live && <>
          <Reveal round={round} />
          {isHost
            ? <FinishRoundButton roundId={round.id} />
            : <p className="text-center text-xs text-[var(--muted-foreground)]">Waiting for the host to start the next round.</p>}
        </>}

        {/* Every host control that is not "the next thing to do", together and
            last in the column: it is the way out, not the way forward. */}
        {isHost && live && <Card className="border-dashed">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm"><Wrench className="size-4 text-[var(--muted-foreground)]" aria-hidden="true" />Host tools</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            {/* Only before anyone commits to a clue -- after that the word is in play. */}
            {round.status === "CLUES" && nobodyHasSpoken && <div className="grid gap-1.5 border-b pb-4">
              <RerollWordButton roundId={round.id} />
              <p className="text-xs leading-5 text-[var(--muted-foreground)]">Draws a different word, keeping everyone&rsquo;s role and turn order.</p>
            </div>}
            <AbandonRoundButton roundId={round.id} />
          </CardContent>
        </Card>}
      </div>

      <div className="grid min-w-0 gap-6 self-start [&>*]:min-w-0">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="size-4 text-[var(--primary)]" aria-hidden="true" />
              Players
              <span className="ml-auto text-sm font-normal text-[var(--muted-foreground)]">Round {round.roundNo}</span>
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

        <ClueList round={round} />
      </div>
    </div>
  </>;
}
