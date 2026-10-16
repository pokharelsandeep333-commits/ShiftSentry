"use client";

import { useEffect, useId, useRef, useState, type CSSProperties } from "react";
import { useFormStatus } from "react-dom";
import { Button, PendingLabel, type ButtonProps } from "@/components/ui/button";

type ConfirmSubmitProps = {
  /** Resting label, e.g. "Archive". Doubles as the affirmative button in the dialog. */
  label: string;
  /** The question, e.g. "Archive job?". Should read as a question. */
  confirmLabel: string;
  /**
   * Text for the affirmative button in the dialog. Defaults to `label`, which
   * reads correctly when the trigger names the act itself ("Delete", "Archive",
   * "End game"). Pass this where the trigger names a destination rather than an
   * action -- "Back to lobby" is a poor answer to "End this round?".
   */
  confirmActionLabel?: string;
  /** A sentence under the question, for when the choice needs explaining. */
  detail?: string;
  /**
   * A second way to go ahead, submitted with `name=value` so the action can
   * tell which was chosen ("delete this one" vs "stop the whole series"). With
   * one, the choices stack full width so neither label is squeezed.
   */
  alternative?: { label: string; name: string; value: string };
  /** Variant for the trigger. The affirmative button is always danger. */
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
};

/**
 * Confirmation guard for destructive form actions: one button that asks before
 * it acts.
 *
 * This used to arm in place -- first click swapped the button for a
 * confirm/cancel pair, second click submitted. That is fine on a desktop and
 * broken on a phone. Arming replaced one ~103px button with two totalling
 * ~184px, and in a `flex-wrap` row that no longer fit, so the pair wrapped onto
 * its own line and lost the `justify-between` that had been holding it right.
 * Measured on the round screen at 375px, the confirm button landed 224px left
 * and 40px below the button that had just been tapped -- with the description
 * paragraph now under the user's finger. The second tap hit text, nothing
 * happened, and the control read as dead. The lobby's "End game" had a milder
 * version of the same shift.
 *
 * A modal `<dialog>` cannot reproduce that: the trigger never changes size, so
 * the row never reflows, and the question renders in the top layer instead of
 * in the middle of somebody's layout. It is also a real focus trap and gets
 * Escape for free, neither of which the in-place version had.
 *
 * Still no dialog dependency -- this is the platform element, not a library.
 */
export function ConfirmSubmit({ label, confirmLabel, confirmActionLabel, detail, alternative, variant = "ghost", size = "sm" }: ConfirmSubmitProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const { pending, data } = useFormStatus();
  // Which submit is in flight, so only the one that was pressed says "Working…".
  const alternativePending = pending && alternative !== undefined && data?.get(alternative.name) === alternative.value;
  const wasPending = useRef(false);
  // The jobs list renders one of these per job, so a fixed id would collide and
  // point every dialog's label at the first question on the page.
  const questionId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  // Escape and the browser's own close paths bypass setOpen, so mirror them back
  // rather than letting React think the dialog is still showing.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const sync = () => setOpen(false);
    dialog.addEventListener("close", sync);
    return () => dialog.removeEventListener("close", sync);
  }, []);

  // Close once the submission settles. On success the surrounding screen
  // usually replaces itself anyway; this is what handles the failure case, so a
  // rejected action's message is not left behind a modal.
  useEffect(() => {
    if (wasPending.current && !pending) setOpen(false);
    wasPending.current = pending;
  }, [pending]);

  return (
    <>
      {/* The label never changes and the button is never swapped out, so the
          row this sits in keeps exactly the same shape from first tap to last. */}
      <Button type="button" variant={variant} size={size} disabled={pending} onClick={() => setOpen(true)}>
        {label}
      </Button>

      <dialog
        ref={dialogRef}
        style={{ "--dialog-width": alternative ? "23rem" : "20rem" } as CSSProperties}
        aria-labelledby={questionId}
        // Clicking the backdrop resolves to the dialog itself, since every real
        // control is nested deeper.
        onClick={(event) => { if (event.target === dialogRef.current) setOpen(false); }}
        // `dialog-pop` (globals.css) animates it and its scrim in and out.
        className="dialog-pop m-auto w-[min(var(--dialog-width),calc(100vw-2rem))] rounded-2xl border border-[color-mix(in_srgb,var(--primary)_20%,var(--border))] bg-[var(--card)] p-0 text-[var(--foreground)] shadow-2xl shadow-black/25"
      >
        <div className="grid gap-4 p-5">
          <div className="grid gap-1.5">
            <p id={questionId} className="text-base font-semibold leading-6">{confirmLabel}</p>
            {detail && <p className="text-sm leading-6 text-[var(--muted-foreground)]">{detail}</p>}
          </div>
          {alternative ? <div className="grid gap-2">
            {/* The narrower choice first; Cancel keeps focus, so a stray Enter still does nothing. */}
            <Button type="submit" variant="danger" size="default" disabled={pending}><PendingLabel pending={pending && !alternativePending} label={confirmActionLabel ?? label} pendingLabel="Working…" /></Button>
            <Button type="submit" name={alternative.name} value={alternative.value} variant="outline" size="default" disabled={pending} className="border-[color-mix(in_srgb,var(--danger)_40%,var(--border))] text-[var(--danger)] hover:border-[var(--danger)] hover:bg-[color-mix(in_srgb,var(--danger)_10%,transparent)]"><PendingLabel pending={alternativePending} label={alternative.label} pendingLabel="Working…" /></Button>
            <Button type="button" variant="ghost" size="default" autoFocus onClick={() => setOpen(false)}>Cancel</Button>
          </div> : <div className="flex flex-wrap justify-end gap-2">
            {/* Focused first: the safe way out should be what a stray Enter hits. */}
            <Button type="button" variant="ghost" size={size} autoFocus onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" variant="danger" size={size} disabled={pending}><PendingLabel pending={pending} label={confirmActionLabel ?? label} pendingLabel="Working…" /></Button>
          </div>}
        </div>
      </dialog>
    </>
  );
}
