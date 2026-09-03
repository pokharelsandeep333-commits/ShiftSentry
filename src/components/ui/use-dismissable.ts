"use client";

import { useEffect, type RefObject } from "react";

/**
 * Closes a popover on an outside press or Escape. Both pickers dismiss without
 * discarding: every choice is already committed by the time the panel closes,
 * so clicking away can never silently revert a selection.
 */
export function useDismissable(open: boolean, rootRef: RefObject<HTMLElement | null>, onDismiss: (restoreFocus: boolean) => void) {
  useEffect(() => {
    if (!open) return;

    function closeOnOutsidePress(event: PointerEvent) {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) onDismiss(false);
    }

    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onDismiss(true);
    }

    document.addEventListener("pointerdown", closeOnOutsidePress);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePress);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [onDismiss, open, rootRef]);
}
