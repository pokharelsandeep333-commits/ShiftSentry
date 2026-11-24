// The OS animation setting can make native smooth scrolling instant.
// Drive the scroll frame by frame to keep the strip animated.

export function easeInOutCubic(t: number): number {
  const progress = Math.min(1, Math.max(0, t));
  return progress < 0.5 ? 4 * progress ** 3 : 1 - 4 * (1 - progress) ** 3;
}

export function scrollDurationFor(distance: number, viewport: number): number {
  if (viewport <= 0) return 420;
  return Math.round(Math.min(900, 420 + 140 * Math.abs(distance) / viewport));
}

export function scrollPositionAt(from: number, to: number, elapsed: number, duration: number): number {
  if (duration <= 0 || elapsed >= duration) return to;
  if (elapsed <= 0) return from;
  return from + (to - from) * easeInOutCubic(elapsed / duration);
}

export type ScrollAnimationOptions = {
  /** Defaults to scrollDurationFor(to - from, el.clientWidth). */
  durationMs?: number;
  /** Called once with true on completion or false on cancellation. */
  onEnd?: (completed: boolean) => void;
  /** Defaults to the browser's animation frame scheduler and performance clock. */
  requestFrame?: (callback: (time: number) => void) => number;
  cancelFrame?: (handle: number) => void;
  now?: () => number;
};

/** Animate scrollLeft and return an idempotent cancellation function. */
export function animateScrollLeft(el: HTMLElement, to: number, options: ScrollAnimationOptions = {}): () => void {
  const from = el.scrollLeft;
  const duration = options.durationMs ?? scrollDurationFor(to - from, el.clientWidth);
  const requestFrame = options.requestFrame ?? ((callback) => window.requestAnimationFrame(callback));
  const cancelFrame = options.cancelFrame ?? ((handle) => window.cancelAnimationFrame(handle));
  const now = options.now ?? (() => performance.now());
  const previousSnap = el.style.scrollSnapType;
  el.style.scrollSnapType = "none";

  let ended = false;
  let frame: number | undefined;

  function finish(completed: boolean) {
    if (ended) return;
    ended = true;
    if (frame !== undefined) cancelFrame(frame);
    el.style.scrollSnapType = previousSnap;
    options.onEnd?.(completed);
  }

  if (Math.abs(to - from) < 1 || duration <= 0) {
    el.scrollTo({ left: to, behavior: "instant" });
    finish(true);
  } else {
    const startedAt = now();
    const tick = () => {
      if (ended) return;
      frame = undefined;
      const elapsed = now() - startedAt;
      const left = scrollPositionAt(from, to, elapsed, duration);
      el.scrollTo({ left, behavior: "instant" });

      if (elapsed >= duration) finish(true);
      else frame = requestFrame(tick);
    };
    frame = requestFrame(tick);
  }

  return () => finish(false);
}
