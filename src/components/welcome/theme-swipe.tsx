"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { ACCENTS, accentPreference, applyAccent, captureName, SMALL_CAPTURE_SUFFIX, SMALL_CAPTURE_WIDTH, type AccentId } from "@/lib/accent";
import { DESKTOP_SHOT_SIZES } from "@/components/welcome/shot-sizes";

/**
 * The landing's dashboard shot, unchanged at rest, with one gesture (Sandeep,
 * 2026-11-23): swipe sideways on it, by trackpad or touch, and the shot
 * follows the fingers while the neighbouring theme's dashboard comes in from
 * the side with depth: small and faded at first, as if further back, growing
 * to full size as it reaches the centre, while the old one shrinks back as it
 * leaves (he tried a card stack and wanted this, like the first carousel).
 * A small flick switches (`commitDistance`, about 50px): the page sweeps
 * over to the new theme at once, without waiting for trackpad momentum to
 * end; a touch shorter than that springs back. Both neighbours' shots are
 * fetched ahead of time, so a switch never waits on the network (he found the
 * first version clunky and slow to change). Left goes forward through `ACCENTS`, right goes back,
 * and the list wraps. Nothing shows at rest: no peeking slides, no dots (he
 * asked for exactly that after seeing a carousel).
 *
 * Preview only, his choice: nothing is written to storage, and leaving the
 * landing (client navigation keeps `<html>`) puts the saved theme back.
 *
 * Moves are written straight to the elements' `translate` (not React state,
 * and not `transform`, which `.showcase-tilt`'s scroll animation owns). The
 * incoming copy uses the same `<picture>` sources and `sizes` as the real
 * shot, so once it lands the real one, now shown by `<html data-accent>`, is
 * the same cached file and the swap is invisible. The sweep is a View
 * Transition on the root revealed by a travelling clip-path
 * (`[data-theme-sweep]` in globals.css).
 */
const GAP = 24;
const WHEEL_QUIET_MS = 140;
const SETTLE_MS = 260;
// Preloaded shots decode at once; this only caps a slow first fetch.
const LOAD_WAIT_MS = 250;

/** How far a swipe has to travel before it switches: a small flick, about 50px on a laptop. */
function commitDistance(width: number) {
  return Math.max(28, Math.min(52, width * 0.06));
}
const EASE = "cubic-bezier(0.22, 1, 0.36, 1)";

type Direction = "forward" | "back";

function currentAccent(): AccentId {
  const value = document.documentElement.dataset.accent;
  return (ACCENTS.find((accent) => accent.id === value)?.id ?? ACCENTS[0].id) as AccentId;
}

function neighbour(direction: Direction): AccentId {
  const index = ACCENTS.findIndex((accent) => accent.id === currentAccent());
  return ACCENTS[(index + (direction === "forward" ? 1 : -1) + ACCENTS.length) % ACCENTS.length].id as AccentId;
}

function currentMode(): "light" | "dark" {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/**
 * The real shots for a theme are lazy and hidden until it applies. Switching
 * one to eager makes the browser fetch it even while hidden; the swipe does
 * that for both neighbours ahead of time (`preloadNeighbours`), so a switch
 * never waits on the network.
 */
function shotsFor(root: HTMLElement, accent: AccentId) {
  const images = Array.from(root.querySelectorAll<HTMLImageElement>(`img[data-shot="${accent}-${currentMode()}"]`));
  for (const image of images) image.loading = "eager";
  return images;
}

async function loadShots(root: HTMLElement, accent: AccentId) {
  const images = shotsFor(root, accent);
  await Promise.race([Promise.allSettled(images.map((image) => image.decode())), new Promise((resolve) => window.setTimeout(resolve, LOAD_WAIT_MS))]);
}

function preloadNeighbours(root: HTMLElement) {
  shotsFor(root, neighbour("forward"));
  shotsFor(root, neighbour("back"));
}

function GhostShot({ accent, mode }: { accent: AccentId; mode: "light" | "dark" }) {
  const stem = captureName("desktop", accent, mode);
  const small = `/welcome/${stem}${SMALL_CAPTURE_SUFFIX}`;
  const both = (format: string) => `${small}.${format} ${SMALL_CAPTURE_WIDTH}w, /welcome/${stem}.${format} 1440w`;
  return <picture>
    <source media="(max-width: 639px)" type="image/avif" srcSet={`${small}.avif`} />
    <source type="image/avif" srcSet={both("avif")} sizes={DESKTOP_SHOT_SIZES} />
    <img src={`/welcome/${stem}.webp`} srcSet={both("webp")} sizes={DESKTOP_SHOT_SIZES} width={1440} height={952} alt="" decoding="async" draggable={false} className="h-auto w-full rounded-[0.9rem] sm:rounded-[1.1rem]" />
  </picture>;
}

export function ThemeSwipe({ className, children }: { className?: string; children: ReactNode }) {
  const rootRef = useRef<HTMLElement>(null);
  const ghostRef = useRef<HTMLDivElement>(null);
  const [ghost, setGhost] = useState<{ accent: AccentId; mode: "light" | "dark" } | null>(null);

  useEffect(() => {
    const root = rootRef.current;
    const ghostEl = ghostRef.current;
    const frame = root?.querySelector<HTMLElement>("[data-swipe-frame]");
    const phone = root?.querySelector<HTMLElement>("[data-swipe-phone]");
    if (!root || !ghostEl || !frame) return;

    let offset = 0; // px the shot has moved; negative is toward the left
    let direction: Direction | null = null;
    let busy = false;
    let wheeling = false;
    let wheelTimer: number | undefined;
    let touch: { x: number; y: number; axis: "x" | "y" | null; start: number } | null = null;

    const width = () => frame.offsetWidth;
    // Where the incoming copy waits: one width plus a gap off to the side it comes from.
    const home = () => (direction === "forward" ? 1 : -1) * (width() + GAP);
    // How far back a shot sits when it is off to the side: smaller and faded.
    const FAR_SCALE = 0.86;
    const FAR_OPACITY = 0.45;

    /**
     * Draw both shots for the current `offset`. They travel side by side, as
     * in a carousel, with depth: the one leaving shrinks and fades back as it
     * goes, the one arriving starts small and faded, as if further away, and
     * grows to full size and strength as it reaches the centre.
     */
    function place(animate: boolean) {
      const transition = animate ? ["translate", "scale", "opacity"].map((property) => `${property} ${SETTLE_MS}ms ${EASE}`).join(", ") : "none";
      frame!.style.transition = transition;
      ghostEl!.style.transition = transition;
      const progress = Math.min(1, Math.abs(offset) / (width() + GAP));
      frame!.style.translate = `${offset}px 0`;
      frame!.style.scale = String(1 - progress * (1 - FAR_SCALE));
      frame!.style.opacity = String(1 - progress * (1 - FAR_OPACITY));
      ghostEl!.style.translate = `${home() + offset}px 0`;
      ghostEl!.style.scale = String(FAR_SCALE + progress * (1 - FAR_SCALE));
      ghostEl!.style.opacity = String(FAR_OPACITY + progress * (1 - FAR_OPACITY));
    }

    function begin(next: Direction) {
      direction = next;
      setGhost({ accent: neighbour(next), mode: currentMode() });
      ghostEl!.style.visibility = "visible";
      if (phone) { phone.style.transition = `opacity 160ms ease`; phone.style.opacity = "0"; }
    }

    function move(delta: number) {
      if (busy) return;
      const next = offset + delta;
      const wanted: Direction = next < 0 ? "forward" : "back";
      if (next !== 0 && wanted !== direction) begin(wanted);
      offset = Math.max(-width(), Math.min(width(), next));
      place(false);
    }

    function reset() {
      frame!.style.transition = ghostEl!.style.transition = "none";
      frame!.style.translate = frame!.style.scale = frame!.style.opacity = "";
      ghostEl!.style.translate = ghostEl!.style.scale = ghostEl!.style.opacity = "";
      ghostEl!.style.visibility = "hidden";
      if (phone) phone.style.opacity = "";
      offset = 0;
      direction = null;
      setGhost(null);
    }

    function wait(ms: number) { return new Promise((resolve) => window.setTimeout(resolve, ms)); }

    async function springBack() {
      if (busy || !direction) return;
      busy = true;
      offset = 0;
      place(true);
      await wait(SETTLE_MS);
      reset();
      busy = false;
    }

    /**
     * Switch at once: the page sweeps over to the new theme straight from
     * wherever the drag is, and the real shot (now shown by `<html
     * data-accent>`) is already in place underneath the sweep.
     */
    async function commit() {
      if (busy || !direction) return;
      busy = true;
      const sweep = direction;
      const target = neighbour(sweep);
      await loadShots(root!, target);
      const html = document.documentElement;
      const swap = () => { applyAccent(target); reset(); };
      if (typeof document.startViewTransition !== "function") swap();
      else {
        html.dataset.themeSweep = sweep;
        const transition = document.startViewTransition(swap);
        await transition.finished.catch(() => undefined);
        delete html.dataset.themeSweep;
      }
      busy = false;
      preloadNeighbours(root!);
    }

    function release() {
      if (Math.abs(offset) >= commitDistance(width())) void commit();
      else void springBack();
    }

    // Trackpad: a horizontal wheel burst drags the shot, and switches the
    // moment it has gone `commitDistance`, without waiting for the momentum
    // to die down. The rest of that burst is swallowed, so one swipe is one
    // theme. A burst too short to switch springs back once it goes quiet.
    let swallow = false;
    function onWheel(event: WheelEvent) {
      const horizontal = Math.abs(event.deltaX) > Math.abs(event.deltaY);
      if (!wheeling && !horizontal) return;
      event.preventDefault(); // no browser back/forward swipe over the shot
      wheeling = true;
      window.clearTimeout(wheelTimer);
      wheelTimer = window.setTimeout(() => {
        wheeling = false;
        if (!swallow) release();
        swallow = false;
      }, WHEEL_QUIET_MS);
      if (busy || swallow) return;
      move(-event.deltaX);
      if (Math.abs(offset) >= commitDistance(width())) {
        swallow = true;
        void commit();
      }
    }

    function onTouchStart(event: TouchEvent) {
      if (busy || event.touches.length !== 1) { touch = null; return; }
      touch = { x: event.touches[0].clientX, y: event.touches[0].clientY, axis: null, start: 0 };
    }
    function onTouchMove(event: TouchEvent) {
      if (!touch) return;
      const dx = event.touches[0].clientX - touch.x;
      const dy = event.touches[0].clientY - touch.y;
      if (!touch.axis) {
        if (Math.hypot(dx, dy) < 8) return;
        touch.axis = Math.abs(dx) > Math.abs(dy) ? "x" : "y";
        touch.start = dx;
      }
      if (touch.axis !== "x") return;
      move(dx - touch.start - offset);
    }
    function onTouchEnd() {
      if (touch?.axis === "x") release();
      touch = null;
    }

    // Fetch both neighbours as soon as the shot is near the screen, so the
    // first swipe is as quick as the rest.
    const seen = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      preloadNeighbours(root);
      seen.disconnect();
    }, { rootMargin: "200px" });
    seen.observe(root);

    root.addEventListener("wheel", onWheel, { passive: false });
    root.addEventListener("touchstart", onTouchStart, { passive: true });
    root.addEventListener("touchmove", onTouchMove, { passive: true });
    root.addEventListener("touchend", onTouchEnd, { passive: true });
    root.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      seen.disconnect();
      window.clearTimeout(wheelTimer);
      root.removeEventListener("wheel", onWheel);
      root.removeEventListener("touchstart", onTouchStart);
      root.removeEventListener("touchmove", onTouchMove);
      root.removeEventListener("touchend", onTouchEnd);
      root.removeEventListener("touchcancel", onTouchEnd);
      applyAccent(accentPreference.read());
    };
  }, []);

  return <figure ref={rootRef} className={className} style={{ touchAction: "pan-y" }}>
    {children}
    {/* The neighbouring theme, off to the side and hidden until a swipe brings it in. */}
    <div ref={ghostRef} aria-hidden="true" className="welcome-frame pointer-events-none absolute inset-x-0 top-0 origin-center rounded-[1.25rem] p-1.5 sm:rounded-[1.5rem] sm:p-2" style={{ visibility: "hidden" }}>
      {ghost && <GhostShot accent={ghost.accent} mode={ghost.mode} />}
    </div>
  </figure>;
}
