"use client";

import { useEffect, useRef, useState } from "react";
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

  useEffect(() => {
    if (armed) confirmRef.current?.focus();
  }, [armed]);

  if (!armed) {
    return <Button type="button" variant={variant} size={size} onClick={() => setArmed(true)}>{label}</Button>;
  }

  return (
    <span className="inline-flex items-center gap-1.5" onKeyDown={(event) => { if (event.key === "Escape") { event.stopPropagation(); setArmed(false); } }}>
      <Button ref={confirmRef} type="submit" variant="danger" size={size} onBlur={(event) => { if (!event.currentTarget.parentElement?.contains(event.relatedTarget as Node)) setArmed(false); }}>{confirmLabel}</Button>
      <Button type="button" variant="ghost" size={size} onClick={() => setArmed(false)}>Cancel</Button>
    </span>
  );
}
