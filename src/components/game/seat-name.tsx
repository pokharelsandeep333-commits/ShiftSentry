"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Check, Pencil, X } from "lucide-react";
import { renameGamePlayer } from "@/app/actions/game";
import { emptyFormState } from "@/lib/form-state";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast-provider";

/**
 * Your own row in the lobby: the name, and the one place it can be changed.
 *
 * Inline rather than a dialog, because the whole edit is a few characters and
 * the row is already where your eye is. The input opens with the current name
 * selected so typing replaces it. Escape or Cancel closes it without saving;
 * a successful save closes it and lets the refreshed roster draw the new name.
 *
 * The form is the row itself while editing, so a long name cannot push the
 * controls off the right edge of a phone -- `min-w-0` on the input is what
 * lets it shrink.
 */
export function SeatName({ roomId, displayName }: { roomId: string; displayName: string }) {
  const { toast } = useToast();
  const [state, formAction, pending] = useActionState(renameGamePlayer, emptyFormState);
  const input = useRef<HTMLInputElement>(null);

  // Whether the input is open is derived, not synced. Opening records which
  // action state was current at the time; the editor stays open until the
  // action produces a *new* state with an empty message -- a success -- and
  // closes by itself. A rejection is also a new state, but it carries a
  // message, so the input stays put for another try. Comparing object identity
  // rather than the message is what lets a second successful save be told
  // apart from the first.
  const [openedAt, setOpenedAt] = useState<typeof state | null>(null);
  const editing = openedAt !== null && !(openedAt !== state && state.message === "");

  // Confirmation only: no state is set here, so this stays a side effect on an
  // external system rather than a render loop.
  const seen = useRef(state);
  useEffect(() => {
    if (seen.current === state) return;
    seen.current = state;
    toast(state.message === "" ? "Name changed" : state.message);
  }, [state, toast]);

  useEffect(() => {
    if (editing) input.current?.select();
  }, [editing]);

  if (!editing) {
    return <>
      <span className="min-w-0 flex-1 truncate py-1 text-sm font-medium">{displayName}</span>
      <span className="shrink-0 text-xs font-normal text-[var(--muted-foreground)]">(you)</span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        aria-label="Change your name in this game"
        title="Change your name"
        onClick={() => setOpenedAt(state)}
        className="text-[var(--muted-foreground)]"
      >
        <Pencil className="size-3.5" />
      </Button>
    </>;
  }

  return <form action={formAction} className="flex min-w-0 flex-1 items-center gap-1.5">
    <input type="hidden" name="roomId" value={roomId} />
    <input
      ref={input}
      name="displayName"
      defaultValue={displayName}
      required
      maxLength={40}
      autoComplete="off"
      autoFocus
      aria-label="Your name in this game"
      aria-invalid={state.message ? true : undefined}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          setOpenedAt(null);
        }
      }}
      className="field-control h-9 min-w-0 flex-1 px-2.5 text-sm"
    />
    <Button type="submit" size="sm" disabled={pending} aria-label="Save name">
      <Check className="size-3.5" />
    </Button>
    <Button type="button" variant="ghost" size="sm" disabled={pending} aria-label="Cancel" onClick={() => setOpenedAt(null)}>
      <X className="size-3.5" />
    </Button>
  </form>;
}
