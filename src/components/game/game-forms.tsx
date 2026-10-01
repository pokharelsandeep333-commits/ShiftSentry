"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { createGameRoom, joinGameRoom } from "@/app/actions/game";
import { emptyFormState } from "@/lib/form-state";
import { Button } from "@/components/ui/button";
import { GAME_CODE_LENGTH, extractGameCode, normalizeGameCode } from "@/lib/game";

function FormError({ message }: { message: string }) {
  if (!message) return null;
  return <p role="alert" className="rounded-xl border border-[color-mix(in_srgb,var(--danger)_35%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2.5 text-sm font-medium text-[var(--danger)]">{message}</p>;
}

/**
 * Neither form asks for a name. You play as your profile name, and the lobby
 * has a rename control on your own row -- one place instead of two, and the
 * same place a player arriving through a link or a QR code gets, since they
 * never see these forms at all.
 */
export function CreateRoomForm({ playingAs }: { playingAs: string }) {
  const [state, formAction, pending] = useActionState(createGameRoom, emptyFormState);

  return <form action={formAction} className="grid gap-4">
    <p className="text-sm leading-6 text-[var(--muted-foreground)]">
      You&rsquo;ll play as <span className="font-semibold text-[var(--foreground)]">{playingAs}</span>. You can change that once you&rsquo;re in.
    </p>
    <FormError message={state.message} />
    <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create a game"}</Button>
    <p className="text-xs leading-5 text-[var(--muted-foreground)]">You&rsquo;ll get a code and a QR code to share. Creating a new game ends any other game you are hosting.</p>
  </form>;
}

/**
 * The join box takes a code, a link, or a code with the separators people add
 * -- and submits itself the moment six valid characters are typed or pasted in,
 * because reaching for a Join button after typing a code is the step everybody
 * forgets on a phone. A code that arrived as `?code=` in the URL only fills the
 * box: joining puts your name in a stranger's roster, so a link anyone can send
 * must not do it without a tap on Join.
 */
export function JoinRoomForm({ initialCode }: { initialCode: string | null }) {
  const [state, formAction, pending] = useActionState(joinGameRoom, emptyFormState);
  const [code, setCode] = useState(initialCode ?? "");
  const form = useRef<HTMLFormElement>(null);

  // Submit when the value becomes a complete code. Driven by the value rather
  // than by the keystroke so a paste and an autofill take the same path. Once
  // the action has rejected something, stop auto-submitting until the value
  // changes again -- otherwise a bad code would re-fire on every render with
  // the same error. Seeded with the URL's code, so that one counts as already
  // tried and waits for the Join button.
  const lastTried = useRef<string | null>(normalizeGameCode(initialCode ?? ""));
  useEffect(() => {
    const complete = normalizeGameCode(code);
    if (!complete || pending || lastTried.current === complete) return;
    lastTried.current = complete;
    form.current?.requestSubmit();
  }, [code, pending]);

  function onChange(event: React.ChangeEvent<HTMLInputElement>) {
    const raw = event.target.value;
    // A pasted invite link is longer than the field allows; lift the code out
    // before the maxLength has a chance to truncate it into nonsense.
    setCode(raw.length > GAME_CODE_LENGTH + 2 ? extractGameCode(raw) ?? raw.slice(0, GAME_CODE_LENGTH + 2) : raw);
  }

  return <form ref={form} action={formAction} className="grid gap-4">
    <label className="field-label">
      <span>Game code</span>
      <input
        name="code"
        required
        value={code}
        onChange={onChange}
        onPaste={(event) => {
          const pasted = extractGameCode(event.clipboardData.getData("text"));
          if (pasted) {
            event.preventDefault();
            setCode(pasted);
          }
        }}
        maxLength={GAME_CODE_LENGTH + 2}
        placeholder="7KQ2MP"
        autoCapitalize="characters"
        autoComplete="off"
        spellCheck={false}
        inputMode="text"
        // `uppercase` is a display transform, not a value transform -- the
        // action normalises what is actually submitted. Doing it here as well
        // just means the field never looks wrong while it is being typed.
        className="field-control text-center font-display text-2xl uppercase tracking-[0.28em] placeholder:tracking-[0.28em] placeholder:opacity-40"
      />
    </label>
    <FormError message={state.message} />
    <Button type="submit" variant="outline" disabled={pending}>{pending ? "Joining…" : "Join game"}</Button>
    <p className="text-xs leading-5 text-[var(--muted-foreground)]">Type the code, paste the invite link, or scan the host&rsquo;s QR code.</p>
  </form>;
}
