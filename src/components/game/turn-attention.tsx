"use client";

import { useEffect } from "react";

/**
 * Gets a player's attention when the game is waiting on them and they are not
 * looking at it.
 *
 * Rendered by the play screen only while something is actually theirs to do --
 * their clue, their vote, their final guess -- so mounting is the signal and
 * unmounting is the all-clear. While it is mounted and the tab is hidden, the
 * title alternates with the prompt so the tab blinks in the strip, and a phone
 * that supports it buzzes once. Coming back to the tab puts the title back.
 *
 * Nothing here needs permission: no Notification API, no audio. Those would
 * prompt on first use, and a permission dialog in the middle of a round is
 * worse than a blinking tab. Vibration is a no-op where unsupported.
 */
const BLINK_MS = 1_200;

export function TurnAttention({ prompt }: { prompt: string }) {
  useEffect(() => {
    const original = document.title;
    let blink: ReturnType<typeof setInterval> | null = null;

    function start() {
      if (blink) return;
      let flipped = false;
      blink = setInterval(() => {
        flipped = !flipped;
        document.title = flipped ? prompt : original;
      }, BLINK_MS);
      document.title = prompt;
      try {
        navigator.vibrate?.(200);
      } catch {
        // Vibration refused or unsupported. The title is doing the work.
      }
    }

    function stop() {
      if (blink) clearInterval(blink);
      blink = null;
      document.title = original;
    }

    function onVisibility() {
      if (document.visibilityState === "hidden") start();
      else stop();
    }

    // Mounting while already hidden -- the common case: the round moved on
    // while the player was in another app.
    if (document.visibilityState === "hidden") start();
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
    };
  }, [prompt]);

  return null;
}
