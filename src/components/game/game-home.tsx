import Link from "next/link";
import { ArrowRight, Crown, KeyRound, LogIn, MessageSquare, Scale, Vote, type LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";
import { SavedToast } from "@/components/saved-toast";
import { CreateRoomForm, JoinRoomForm } from "@/components/game/game-forms";
import { MIN_PLAYERS_TO_START } from "@/lib/game";

const HOW_IT_WORKS: { icon: LucideIcon; title: string; body: string }[] = [
  { icon: KeyRound, title: "Get the word", body: "Everyone in the room gets the same secret word. One player, the imposter, doesn't." },
  { icon: MessageSquare, title: "Give a clue", body: "Take turns giving a one-word clue. Say too little and you look suspicious; say too much and you hand it to the imposter." },
  { icon: Vote, title: "Vote", body: "Everyone votes. The imposter wins by surviving the vote, or by naming the word after being caught." },
  { icon: Scale, title: "Ties", body: "If the vote ties, nobody goes out. One more clue each, then vote again. Twice at most, then the imposter takes it." },
];

/**
 * The Imposter start page: host or join, then how a round goes. `/game` loads
 * the data; this only draws it. `initialCode` comes from `?code=` and only
 * fills the join box -- joining still takes a tap (see JoinRoomForm).
 */
export function GameHome({ activeCode, playingAs, initialCode, savedMessage }: { activeCode: string | null; playingAs: string; initialCode: string | null; savedMessage?: string }) {
  return <>
    {savedMessage && <SavedToast message={savedMessage} />}
    <PageHeader
      title="Imposter"
      description={`A word game for ${MIN_PLAYERS_TO_START} or more. Everyone shares a secret word except one player, and the rest have to work out who.`}
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

    {/* Host and join side by side in one card: they are the two ways in, and a
        person arriving here is one or the other. On a phone they stack, host
        first, with "or" between them. */}
    <Card className="overflow-hidden">
      <div className="grid md:grid-cols-[1fr_auto_1fr]">
        <section aria-labelledby="host-title" className="grid content-start gap-4 p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)]"><Crown className="size-5" aria-hidden="true" /></span>
            <div>
              <h2 id="host-title" className="font-display text-lg font-semibold">Host a game</h2>
              <p className="text-sm text-[var(--muted-foreground)]">Get a code and a QR to share.</p>
            </div>
          </div>
          <CreateRoomForm playingAs={playingAs} />
        </section>

        <div className="flex items-center gap-3 px-5 md:flex-col md:px-0 md:py-6" aria-hidden="true">
          <span className="h-px flex-1 bg-[var(--border)] md:h-auto md:w-px" />
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--muted-foreground)]">or</span>
          <span className="h-px flex-1 bg-[var(--border)] md:h-auto md:w-px" />
        </div>

        <section aria-labelledby="join-title" className="grid content-start gap-4 p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <span className="grid size-10 place-items-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]"><LogIn className="size-5" aria-hidden="true" /></span>
            <div>
              <h2 id="join-title" className="font-display text-lg font-semibold">Join a game</h2>
              <p className="text-sm text-[var(--muted-foreground)]">Type the code you were given.</p>
            </div>
          </div>
          <JoinRoomForm initialCode={initialCode} />
        </section>
      </div>
    </Card>

    <section aria-labelledby="how-title" className="mt-8">
      <h2 id="how-title" className="mb-4 font-display text-xl font-semibold">How it works</h2>
      <ol className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {HOW_IT_WORKS.map((step, index) => {
          const Icon = step.icon;
          return <li key={step.title}>
            <Card className="h-full p-5">
              <div className="flex items-center gap-3">
                <span className="grid size-9 place-items-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]"><Icon className="size-4" aria-hidden="true" /></span>
                <span className="text-xs font-semibold text-[var(--muted-foreground)]">Step {index + 1}</span>
              </div>
              <p className="mt-3 font-display text-base font-semibold">{step.title}</p>
              <p className="mt-1.5 text-sm leading-6 text-[var(--muted-foreground)]">{step.body}</p>
            </Card>
          </li>;
        })}
      </ol>
      <p className="mt-4 rounded-xl bg-[var(--surface-subtle)] px-3.5 py-3 text-xs leading-5 text-[var(--muted-foreground)]">The host can turn on a decoy word, show the imposter the category, add a second imposter, and pick which category the words come from.</p>
    </section>
  </>;
}
