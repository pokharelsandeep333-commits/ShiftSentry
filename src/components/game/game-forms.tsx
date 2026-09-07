"use client";

import { useActionState } from "react";
import { createGameRoom, joinGameRoom } from "@/app/actions/game";
import { emptyFormState } from "@/lib/form-state";
import { Button } from "@/components/ui/button";
import { GAME_CODE_LENGTH } from "@/lib/game";

function FormError({ message }: { message: string }) {
  if (!message) return null;
  return <p role="alert" className="rounded-xl border border-[color-mix(in_srgb,var(--danger)_35%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2.5 text-sm font-medium text-[var(--danger)]">{message}</p>;
}

/**
 * Both forms leave the name blank by default. The database falls back to the
 * profile display name and then the email handle, so the common case is one
 * click, and the field is there for the times you want to be someone else in a
 * game with people who know you by a different name.
 */
export function CreateRoomForm({ defaultName }: { defaultName: string }) {
  const [state, formAction, pending] = useActionState(createGameRoom, emptyFormState);

  return <form action={formAction} className="grid gap-4">
    <label className="field-label">
      <span>Your name in the game</span>
      <input name="displayName" maxLength={40} placeholder={defaultName} className="field-control" autoComplete="off" />
    </label>
    <FormError message={state.message} />
    <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create a game"}</Button>
    <p className="text-xs leading-5 text-[var(--muted-foreground)]">You&rsquo;ll get a code to share. Creating a new game ends any other game you are hosting.</p>
  </form>;
}

export function JoinRoomForm({ defaultName }: { defaultName: string }) {
  const [state, formAction, pending] = useActionState(joinGameRoom, emptyFormState);

  return <form action={formAction} className="grid gap-4">
    <label className="field-label">
      <span>Game code</span>
      <input
        name="code"
        required
        maxLength={GAME_CODE_LENGTH + 2}
        placeholder="7KQ2MP"
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        // `uppercase` is a display transform, not a value transform -- the
        // action normalises what is actually submitted. Doing it here as well
        // just means the field never looks wrong while it is being typed.
        className="field-control text-center font-display text-2xl uppercase tracking-[0.28em] placeholder:tracking-[0.28em] placeholder:opacity-40"
      />
    </label>
    <label className="field-label">
      <span>Your name in the game</span>
      <input name="displayName" maxLength={40} placeholder={defaultName} className="field-control" autoComplete="off" />
    </label>
    <FormError message={state.message} />
    <Button type="submit" variant="outline" disabled={pending}>{pending ? "Joining…" : "Join game"}</Button>
  </form>;
}
