import { Check } from "lucide-react";
import type { RoundView } from "@/lib/game-round";
import { cn } from "@/lib/utils";

type Step = { key: string; label: string };

/**
 * Where the round is, and what comes after it. The steps are the round's own
 * rules -- Talk only when the round has a discussion phase, Guess only when a
 * caught imposter may guess -- so nothing here depends on anyone's role. A
 * round that skips Guess (the vote missed, so the imposter simply wins) jumps
 * from Vote to Reveal, which everyone sees anyway.
 */
export function roundSteps(round: Pick<RoundView, "discussionPhase" | "imposterFinalGuess">): Step[] {
  return [
    { key: "CLUES", label: "Clues" },
    ...(round.discussionPhase ? [{ key: "DISCUSSION", label: "Talk" }] : []),
    { key: "VOTING", label: "Vote" },
    ...(round.imposterFinalGuess ? [{ key: "GUESSING", label: "Guess" }] : []),
    { key: "REVEAL", label: "Reveal" },
  ];
}

/** The step a phase belongs to: dealing counts as the start of clues, ended as the reveal. */
function stepKey(status: RoundView["status"]) {
  return status === "DEALING" ? "CLUES" : status === "ENDED" ? "REVEAL" : status;
}

export function phaseLabel(round: RoundView) {
  const step = roundSteps(round).find((candidate) => candidate.key === stepKey(round.status));
  if (round.status === "CLUES" && round.isTiebreak) return "Tiebreak";
  return step?.label ?? "Round";
}

export function PhaseTracker({ round }: { round: RoundView }) {
  const steps = roundSteps(round);
  const current = Math.max(0, steps.findIndex((step) => step.key === stepKey(round.status)));
  const finished = round.status === "REVEAL" || round.status === "ENDED";
  const detail = round.status === "CLUES"
    ? round.isTiebreak ? "Tiebreak: one more clue each" : round.cluePasses > 1 ? `Pass ${round.currentPass} of ${round.cluePasses}` : null
    : null;

  return <nav aria-label="Round progress" className="mb-6">
    <ol className="flex items-center gap-1.5 sm:gap-2">
      {steps.map((step, index) => {
        const done = index < current || (finished && index === current);
        const active = index === current && !finished;
        return <li key={step.key} className="flex min-w-0 flex-1 items-center gap-1.5 sm:gap-2" aria-current={active ? "step" : undefined}>
          <span className={cn(
            "grid size-7 shrink-0 place-items-center rounded-full text-xs font-bold transition-colors",
            done ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
              : active ? "bg-[var(--primary-soft)] text-[var(--primary)] ring-2 ring-[var(--primary)]"
                : "bg-[var(--muted)] text-[var(--muted-foreground)]",
          )}>
            {done ? <Check className="size-3.5" strokeWidth={3} aria-hidden="true" /> : index + 1}
          </span>
          <span className={cn("truncate text-xs font-semibold sm:text-sm", active ? "text-[var(--foreground)]" : "text-[var(--muted-foreground)]")}>{step.label}</span>
          {index < steps.length - 1 && <span aria-hidden="true" className={cn("hidden h-0.5 min-w-3 flex-1 rounded-full sm:block", index < current || finished ? "bg-[var(--primary)]" : "bg-[var(--border)]")} />}
        </li>;
      })}
    </ol>
    {detail && <p className="mt-2 text-xs font-semibold text-[var(--primary)]">{detail}</p>}
  </nav>;
}
