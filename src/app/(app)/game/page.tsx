import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { SavedToast } from "@/components/saved-toast";
import { CreateRoomForm, JoinRoomForm } from "@/components/game/game-forms";
import { requireUser } from "@/lib/auth";
import { fetchActiveRoomCode } from "@/lib/game-lobby";
import { MIN_PLAYERS_TO_START } from "@/lib/game";

export const dynamic = "force-dynamic";

const SAVED_MESSAGES: Record<string, string> = {
  "room-left": "You left the game",
  "room-ended": "Game ended",
};

const HOW_IT_WORKS = [
  "Everyone in the room gets the same secret word. One player — the imposter — doesn't.",
  "Take turns giving a one-word clue about it. Say too little and you look suspicious; say too much and you hand it to the imposter.",
  "Then everyone votes. The imposter wins by surviving the vote, or by naming the word after being caught.",
  "If the vote ties, nobody goes out — you all give one more clue and vote again. Twice at most, then the imposter takes it.",
];

function first(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export default async function GamePage({ searchParams }: { searchParams: Promise<{ saved?: string | string[]; code?: string | string[] }> }) {
  const [profile, { saved, code }] = await Promise.all([requireUser(), searchParams]);
  const activeCode = await fetchActiveRoomCode();
  // The same fallback chain as the database, so the sentence on the create card
  // names the seat you will actually get.
  const playingAs = profile.display_name?.trim() || profile.email.split("@")[0];
  const savedMessage = SAVED_MESSAGES[first(saved)];
  // `/game?code=ABC234` lands with the box filled and submitting itself.
  const initialCode = first(code) || null;

  return <>
    {savedMessage && <SavedToast message={savedMessage} />}
    <PageHeader
      eyebrow="Imposter"
      title="Find the imposter"
      description={`A word game for ${MIN_PLAYERS_TO_START} or more people. Create a game, let everyone scan the QR code, and play from wherever you are sitting.`}
    />

    {activeCode && <Card className="mb-6 border-[color-mix(in_srgb,var(--primary)_28%,var(--border))] bg-[var(--primary-soft)]">
      <CardContent className="flex flex-wrap items-center justify-between gap-3 pt-5 sm:pt-6">
        <div>
          <p className="font-display text-lg font-semibold">You&rsquo;re in a game</p>
          <p className="mt-1 text-sm text-[var(--muted-foreground)]">Code <span className="font-semibold tracking-[0.18em] text-[var(--foreground)]">{activeCode}</span></p>
        </div>
        <Link href={`/game/${activeCode}`} className={buttonVariants({ size: "sm" })}>Back to the lobby<ArrowRight className="size-4" /></Link>
      </CardContent>
    </Card>}

    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <Card className="h-fit">
        <CardHeader><CardTitle>Start a game</CardTitle></CardHeader>
        <CardContent><CreateRoomForm playingAs={playingAs} /></CardContent>
      </Card>

      <Card className="h-fit">
        <CardHeader><CardTitle>Join with a code</CardTitle></CardHeader>
        <CardContent><JoinRoomForm initialCode={initialCode} /></CardContent>
      </Card>
    </div>

    <Card className="mt-6">
      <CardHeader><CardTitle>How it works</CardTitle></CardHeader>
      <CardContent>
        <ol className="grid gap-3">
          {HOW_IT_WORKS.map((step, index) => <li key={step} className="flex gap-3 text-sm leading-6 text-[var(--muted-foreground)]">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[var(--primary-soft)] text-xs font-bold text-[var(--primary)]">{index + 1}</span>
            <span>{step}</span>
          </li>)}
        </ol>
        <p className="mt-4 rounded-xl bg-[var(--surface-subtle)] px-3 py-2.5 text-xs leading-5 text-[var(--muted-foreground)]">The host can turn on a decoy word, show the imposter the category, add a second imposter, and pick which category the words come from.</p>
      </CardContent>
    </Card>
  </>;
}
