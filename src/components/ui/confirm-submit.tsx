"use client";

import { useEffect, useId, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/components/ui/button";

type ConfirmSubmitProps = {
  /** Resting label, e.g. "Archive". Doubles as the affirmative button in the dialog. */
  label: string;
  /** The question, e.g. "Archive job?". Should read as a question. */
  confirmLabel: string;
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
export function ConfirmSubmit({ label, confirmLabel, variant = "ghost", size = "sm" }: ConfirmSubmitProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const { pending } = useFormStatus();
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
        aria-labelledby={questionId}
        // Clicking the backdrop resolves to the dialog itself, since every real
        // control is nested deeper.
        onClick={(event) => { if (event.target === dialogRef.current) setOpen(false); }}
        className="m-auto w-[min(20rem,calc(100vw-2rem))] rounded-2xl border border-[color-mix(in_srgb,var(--primary)_20%,var(--border))] bg-[var(--card)] p-0 text-[var(--foreground)] shadow-2xl shadow-black/25 backdrop:bg-black/50"
      >
        <div className="grid gap-4 p-5">
          <p id={questionId} className="text-base font-semibold leading-6">{confirmLabel}</p>
          <div className="flex flex-wrap justify-end gap-2">
            {/* Focused first: the safe way out should be what a stray Enter hits. */}
            <Button type="button" variant="ghost" size={size} autoFocus onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="submit" variant="danger" size={size} disabled={pending}>{pending ? "Working…" : label}</Button>
          </div>
        </div>
      </dialog>
    </>
  );
}
