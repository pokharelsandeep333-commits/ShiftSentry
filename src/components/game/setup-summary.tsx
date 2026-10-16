import { BookOpen, Eye, EyeOff, Lightbulb, MessageSquare, MessagesSquare, Repeat, Users, UsersRound, type LucideIcon } from "lucide-react";
import { IMPOSTER_HINT_LABELS, WORD_DIFFICULTY_LABELS, type GameSettings, type ImposterHint } from "@/lib/game";

type Rule = { icon: LucideIcon; label: string; detail: string };

const HINT_CHIP: Record<ImposterHint, string> = {
  NONE: "No hint for the imposter",
  CATEGORY: "Imposter sees the category",
  RELATED: "Imposter gets a related word",
  DECOY: "Imposter gets a decoy word",
};

/**
 * The room's rules as short labels with a sentence each. Everyone in the room
 * sees the same settings, so nothing here is secret: the hint is the room's
 * rule, not anybody's role.
 */
export function setupRules(settings: GameSettings, playerCount: number): Rule[] {
  const players = `${playerCount} ${playerCount === 1 ? "player" : "players"}`;
  return [
    { icon: Users, label: settings.imposterCount === 1 ? "1 imposter" : `${settings.imposterCount} imposters`, detail: `${settings.imposterCount === 1 ? "One imposter" : `${settings.imposterCount} imposters`} among ${players}.` },
    settings.hideRoles
      ? { icon: EyeOff, label: "Roles hidden", detail: "Everyone gets a word and nobody is told whose is the odd one." }
      : { icon: Eye, label: HINT_CHIP[settings.imposterHint], detail: IMPOSTER_HINT_LABELS[settings.imposterHint].description },
    { icon: MessageSquare, label: settings.cluePasses === 1 ? "1 clue each" : `${settings.cluePasses} clues each`, detail: settings.discussionPhase ? "Then a discussion, then the vote." : "Then straight to the vote." },
    ...(settings.discussionPhase ? [{ icon: MessagesSquare, label: "Talk before voting", detail: "The vote stays locked until the host opens it." }] : []),
    { icon: Repeat, label: settings.banRepeatClues ? "No repeated clues" : "Repeats allowed", detail: settings.banRepeatClues ? "A clue somebody already said is refused." : "Repeating someone else's clue is allowed." },
    { icon: Lightbulb, label: settings.imposterFinalGuess ? "Final guess on" : "No final guess", detail: settings.imposterFinalGuess ? "A caught imposter still wins by naming the word." : "Getting caught ends it." },
    { icon: BookOpen, label: `${settings.categoryFilter ?? "All categories"} · ${WORD_DIFFICULTY_LABELS[settings.wordDifficulty].label} words`, detail: WORD_DIFFICULTY_LABELS[settings.wordDifficulty].description },
    { icon: UsersRound, label: `Up to ${settings.maxPlayers} players`, detail: "The room stops taking new players at this size." },
  ];
}

/** The rules as a row of chips: the host's at-a-glance summary above Edit setup. */
export function SetupChips({ settings, playerCount }: { settings: GameSettings; playerCount: number }) {
  return <ul className="flex flex-wrap gap-2" aria-label="Game setup">
    {setupRules(settings, playerCount).map((rule) => {
      const Icon = rule.icon;
      return <li key={rule.label} title={rule.detail} className="flex min-w-0 max-w-full items-center gap-1.5 rounded-full border bg-[var(--card)]/60 px-3 py-1.5 text-xs font-semibold">
        <Icon className="size-3.5 shrink-0 text-[var(--primary)]" aria-hidden="true" />
        <span className="min-w-0 truncate">{rule.label}</span>
      </li>;
    })}
  </ul>;
}

/** The rules as a list with their explanation, for players who cannot change them. */
export function SetupList({ settings, playerCount }: { settings: GameSettings; playerCount: number }) {
  return <ul className="grid gap-3">
    {setupRules(settings, playerCount).map((rule) => {
      const Icon = rule.icon;
      return <li key={rule.label} className="flex min-w-0 gap-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--primary-soft)] text-[var(--primary)]"><Icon className="size-4" aria-hidden="true" /></span>
        <span className="min-w-0">
          <span className="block break-words text-sm font-semibold">{rule.label}</span>
          <span className="block text-xs leading-5 text-[var(--muted-foreground)]">{rule.detail}</span>
        </span>
      </li>;
    })}
  </ul>;
}
