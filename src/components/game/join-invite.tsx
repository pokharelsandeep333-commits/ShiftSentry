"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ArrowRight } from "lucide-react";
import { joinGameRoom } from "@/app/actions/game";
import { emptyFormState } from "@/lib/form-state";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/**
 * What a link or a QR scan lands on when you are not yet in the room.
 *
 * One button, no fields: the code is in the URL and the name comes from your
 * profile. Deliberately a button and not an automatic join on page load -- a
 * GET that seats you is a GET that a link preview, a prefetch or a curious
 * crawler could trigger, and "who is Slackbot and why is it in my game" is not
 * a bug worth having.
 *
 * The page cannot tell a real room from a mistyped code without leaking which
 * codes exist, so it does not try. The join function says which it was, in a
 * sentence written for the person reading it.
 */
export function JoinInvite({ code }: { code: string }) {
  const [state, formAction, pending] = useActionState(joinGameRoom, emptyFormState);

  return <Card className="mx-auto max-w-lg text-center">
    <CardHeader>
      <CardTitle>You&rsquo;ve been invited to a game</CardTitle>
    </CardHeader>
    <CardContent className="grid gap-4">
      <p className="font-display text-4xl font-semibold tracking-[0.28em]" aria-label={`Game code ${code.split("").join(" ")}`}>{code}</p>
      <form action={formAction} className="grid gap-3">
        <input type="hidden" name="code" value={code} />
        {state.message && <p role="alert" className="rounded-xl border border-[color-mix(in_srgb,var(--danger)_35%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2.5 text-sm font-medium text-[var(--danger)]">{state.message}</p>}
        <Button type="submit" disabled={pending} className="mx-auto">
          {pending ? "Joining…" : "Join this game"}
          {!pending && <ArrowRight className="size-4" />}
        </Button>
      </form>
      <Link href="/game" className={cn(buttonVariants({ variant: "ghost", size: "sm" }), "mx-auto")}>Not this one</Link>
    </CardContent>
  </Card>;
}
