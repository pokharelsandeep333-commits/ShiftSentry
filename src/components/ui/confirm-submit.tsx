"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/components/ui/button";

type ConfirmSubmitProps = {
  /** Resting label, e.g. "Archive". */
  label: string;
  /** Label once armed, e.g. "Archive job?". Should read as a question. */
  confirmLabel: string;
  /** Variant for the resting button. The armed button is always danger. */
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
};

/**
 * Two-step submit guard for destructive form actions. The first click arms the
 * control rather than submitting; the second confirms. Escape or Cancel backs
 * out, and arming moves focus to the confirm button so keyboard users are not
 * stranded.
 *
 * Deliberately not a modal: no dialog dependency, and the confirmation stays
 * anchored to the row it affects.
 */
export function ConfirmSubmit({ label, confirmLabel, variant = "ghost", size = "sm" }: ConfirmSubmitProps) {
  const [armed, setArmed] = useState(false);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const { pending } = useFormStatus();

  useEffect(() => {
    // `preventScroll` because on a phone the focus call would otherwise scroll
    // the freshly armed button out from under the thumb that just armed it, and
    // the confirming tap lands somewhere else entirely.
    if (armed) confirmRef.current?.focus({ preventScroll: true });
  }, [armed]);

  // A submission in flight keeps the confirm button mounted and labelled, rather
  // than leaving a dead-looking control while the action runs.
  if (pending) {
    return <Button type="button" variant="danger" size={size} disabled>Working…</Button>;
  }

  if (!armed) {
    return <Button type="button" variant={variant} size={size} onClick={() => setArmed(true)}>{label}</Button>;
  }

  return (
    <span className="inline-flex items-center gap-1.5" onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setArmed(false); } }}>
      <Button
        ref={confirmRef}
        type="submit"
        variant="danger"
        size={size}
        onBlur={(event) => {
          // A null relatedTarget means the browser cannot say where focus went,
          // which on touch is the common case rather than the exception -- it
          // fires for taps on any non-focusable area, and on iOS for the tap
          // that lands on this very button. Treating that as "focus left" was
          // disarming the control mid-tap, so the confirming press hit a button
          // that had already unmounted and the whole thing looked broken.
          //
          // Only disarm when focus demonstrably moved somewhere outside.
          const movedTo = event.relatedTarget as Node | null;
          if (movedTo && !event.currentTarget.parentElement?.contains(movedTo)) setArmed(false);
        }}
      >{confirmLabel}</Button>
      <Button type="button" variant="ghost" size={size} onClick={() => setArmed(false)}>Cancel</Button>
    </span>
  );
}
