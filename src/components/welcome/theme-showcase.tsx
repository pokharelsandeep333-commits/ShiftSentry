"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ACCENTS, accentPreference, applyAccent, captureName, SMALL_CAPTURE_SUFFIX, SMALL_CAPTURE_WIDTH, type AccentId } from "@/lib/accent";
import { animateScrollLeft } from "@/lib/animate-scroll";
import { cn } from "@/lib/utils";

/**
 * The landing's dashboard shot as a sideways strip, one slide per colour
 * theme (Sandeep's idea, 2026-11-23): scroll or swipe it, and when a slide
 * settles the whole page recolours to that theme with a sweep from the side
 * the visitor scrolled toward. The next theme's slide peeks in at the edge,
 * and slides grow toward the centre as they travel (`.theme-slide`, a
 * scroll-driven animation where supported). Theme dots and arrows below it
 * move the strip too. He tried a hidden swipe on the plain shot and then
 * asked for this version back.
 *
 * Preview only, by his choice: nothing is written to storage. The strip
 * starts on the visitor's saved theme, and leaving the landing (client
 * navigation keeps `<html>`) puts the saved theme back.
 *
 * The sweep is a View Transition on the root: the old page stays put and the
 * new one is revealed by a clip-path that travels across it
 * (`[data-theme-sweep]` rules in globals.css). It starts only once scrolling
 * has stopped, so the frozen snapshot never fights a moving strip.
 *
 * Each slide holds that theme's capture in light and in dark; CSS shows the
 * one for the current mode, and a `display: none` lazy image is never
 * fetched, so a visitor downloads only what they scroll to. Each slide also
 * carries that theme's phone capture, so the phone moves with its slide (a
 * single shared phone over the strip stood still while the slides moved).
 *
 * Dots and arrows glide the strip with `animateScrollLeft`, frame by frame,
 * not `scrollTo({ behavior: "smooth" })`: with Windows "Animation effects"
 * off the browser makes smooth scrolling instant, and a click jumped while a
 * swipe still glided (Sandeep, 2026-11-24). While that glide runs, `settle`
 * waits, so the page sweeps once, to the slide it lands on; touching the
 * strip mid-glide hands it back to the visitor.
 */
const DESKTOP_SHOT_SIZES = "(min-width: 1760px) 76rem, (min-width: 1440px) 68rem, (min-width: 1152px) 62rem, calc(88vw - 2rem)";
const SETTLE_MS = 140;

type Direction = "forward" | "back";

function sweepTo(accent: AccentId, direction: Direction) {
  const root = document.documentElement;
  const apply = () => applyAccent(accent);
  if (typeof document.startViewTransition !== "function") return apply();
  root.dataset.themeSweep = direction;
  const transition = document.startViewTransition(apply);
  // A hidden tab aborts the transition (the theme still applies); that is not an error.
  transition.ready.catch(() => undefined);
  transition.finished.catch(() => undefined).finally(() => { delete root.dataset.themeSweep; });
}

function SlideShot({ accent, alt }: { accent: AccentId; alt: string }) {
  return <>{(["light", "dark"] as const).map((mode) => {
    const stem = captureName("desktop", accent, mode);
    const small = `/welcome/${stem}${SMALL_CAPTURE_SUFFIX}`;
    const both = (format: string) => `${small}.${format} ${SMALL_CAPTURE_WIDTH}w, /welcome/${stem}.${format} 1440w`;
    return <picture key={mode}>
      <source media="(max-width: 639px)" type="image/avif" srcSet={`${small}.avif`} />
      <source type="image/avif" srcSet={both("avif")} sizes={DESKTOP_SHOT_SIZES} />
      <img src={`/welcome/${stem}.webp`} srcSet={both("webp")} sizes={DESKTOP_SHOT_SIZES} data-mode={mode} width={1440} height={952} alt={alt} loading="lazy" decoding="async" draggable={false} className="theme-shot h-auto w-full rounded-[0.9rem] sm:rounded-[1.1rem]" />
    </picture>;
  })}</>;
}

/** That theme's phone capture, in both modes like the desktop one. */
function PhoneShot({ accent, alt }: { accent: AccentId; alt: string }) {
  return <>{(["light", "dark"] as const).map((mode) => {
    const stem = captureName("mobile", accent, mode);
    return <picture key={mode}>
      <source type="image/avif" srcSet={`/welcome/${stem}.avif`} />
      <img src={`/welcome/${stem}.webp`} data-mode={mode} width={390} height={844} alt={alt} loading="lazy" decoding="async" draggable={false} className="theme-shot h-auto w-full rounded-[1.15rem]" />
    </picture>;
  })}</>;
}

export function ThemeShowcase({ alt, phoneAlt }: { alt: string; phoneAlt: string }) {
  const trackRef = useRef<HTMLDivElement>(null);
  // Until the visitor moves the strip, the current slide is their saved theme
  // (Violet on the server render, as everywhere else).
  const saved = useSyncExternalStore(accentPreference.subscribe, accentPreference.read, accentPreference.serverSnapshot);
  const savedIndex = Math.max(0, ACCENTS.findIndex((accent) => accent.id === saved));
  const [moved, setMoved] = useState<number | null>(null);
  const active = moved ?? savedIndex;
  // The scroll listener reads the current slide without re-subscribing.
  const activeRef = useRef(active);
  useEffect(() => { activeRef.current = active; }, [active]);

  // The running glide, if any, and the slide it is heading for (so a second
  // arrow click counts on from there, not from the slide still shown).
  const glideRef = useRef<{ cancel: () => void; target: number } | null>(null);

  const slideAt = useCallback((index: number) => trackRef.current?.querySelectorAll<HTMLElement>("[data-slide]")[index] ?? null, []);

  // When the strip comes to rest, the slide nearest its centre is the theme.
  const settle = useCallback(() => {
    const track = trackRef.current;
    if (!track || glideRef.current) return;
    const centre = track.scrollLeft + track.clientWidth / 2;
    const slides = Array.from(track.querySelectorAll<HTMLElement>("[data-slide]"));
    if (slides.length === 0) return;
    let nearest = 0;
    slides.forEach((slide, index) => {
      const distance = Math.abs(slide.offsetLeft + slide.offsetWidth / 2 - centre);
      const best = Math.abs(slides[nearest].offsetLeft + slides[nearest].offsetWidth / 2 - centre);
      if (distance < best) nearest = index;
    });
    if (nearest === activeRef.current) return;
    const direction: Direction = nearest > activeRef.current ? "forward" : "back";
    activeRef.current = nearest;
    setMoved(nearest);
    sweepTo(ACCENTS[nearest].id, direction);
  }, []);

  const stopGlide = useCallback(() => {
    const glide = glideRef.current;
    glideRef.current = null;
    glide?.cancel();
  }, []);

  const scrollToIndex = useCallback((index: number, animate = true) => {
    const track = trackRef.current;
    const slide = slideAt(index);
    if (!track || !slide) return;
    const left = slide.offsetLeft - (track.clientWidth - slide.offsetWidth) / 2;
    stopGlide();
    if (!animate) {
      track.scrollTo({ left, behavior: "instant" });
      return;
    }
    // A glide of under a pixel ends inside animateScrollLeft, before it
    // returns, so only a glide still running is kept.
    let ended = false;
    const glide = { target: index, cancel: () => {} };
    glide.cancel = animateScrollLeft(track, left, {
      onEnd: (completed) => {
        ended = true;
        if (glideRef.current === glide) glideRef.current = null;
        if (completed) settle();
      },
    });
    if (!ended) glideRef.current = glide;
  }, [settle, slideAt, stopGlide]);

  const step = (by: number) => {
    const from = glideRef.current?.target ?? active;
    scrollToIndex(Math.min(ACCENTS.length - 1, Math.max(0, from + by)));
  };

  // Start on the visitor's own theme, without a sweep.
  useEffect(() => { scrollToIndex(savedIndex, false); }, [savedIndex, scrollToIndex]);
  // Preview only: leaving the landing puts the saved theme back.
  useEffect(() => () => { stopGlide(); applyAccent(accentPreference.read()); }, [stopGlide]);

  useEffect(() => {
    const track = trackRef.current;
    if (!track) return;
    let timer: number | undefined;
    const onSettle = () => { window.clearTimeout(timer); settle(); };
    // `scrollend` where it exists; a short pause in `scroll` events elsewhere.
    const onScroll = () => { window.clearTimeout(timer); timer = window.setTimeout(onSettle, SETTLE_MS); };
    const hasScrollEnd = "onscrollend" in window;
    // The visitor taking hold of the strip mid-glide stops the glide; their
    // own scroll then settles as usual.
    const takeOver = () => { if (glideRef.current) stopGlide(); };
    const takeOverEvents = ["wheel", "touchstart", "pointerdown", "keydown"] as const;
    track.addEventListener(hasScrollEnd ? "scrollend" : "scroll", hasScrollEnd ? onSettle : onScroll, { passive: true });
    takeOverEvents.forEach((type) => track.addEventListener(type, takeOver, { passive: true }));
    return () => {
      window.clearTimeout(timer);
      track.removeEventListener(hasScrollEnd ? "scrollend" : "scroll", hasScrollEnd ? onSettle : onScroll);
      takeOverEvents.forEach((type) => track.removeEventListener(type, takeOver));
    };
  }, [settle, stopGlide]);

  const current = ACCENTS[active];

  return <div className="theme-showcase">
    <div className="relative">
      <div
        ref={trackRef}
        role="region"
        aria-roledescription="carousel"
        aria-label="The dashboard in each colour theme. Scroll sideways to try one."
        tabIndex={0}
        className="theme-track flex snap-x snap-mandatory gap-4 overflow-x-auto overscroll-x-contain px-[6%] pb-14 pt-2 outline-none [scrollbar-width:none] focus-visible:ring-4 focus-visible:ring-[var(--primary-soft)] sm:gap-6 [&::-webkit-scrollbar]:hidden"
      >
        {ACCENTS.map((accent, index) => <div
          key={accent.id}
          data-slide
          role="group"
          aria-roledescription="slide"
          aria-label={`${accent.label}, ${index + 1} of ${ACCENTS.length}`}
          className="theme-slide relative w-[88%] shrink-0 snap-center"
        >
          <div className="welcome-frame rounded-[1.25rem] p-1.5 sm:rounded-[1.5rem] sm:p-2">
            <SlideShot accent={accent.id} alt={index === 0 ? alt : `The same dashboard in the ${accent.label} theme.`} />
          </div>
          {/* Each slide carries its own phone, so the phone travels with its theme.
              z-10: the desktop frame sits on its own compositing layer and otherwise covers it. */}
          <div className="welcome-phone pointer-events-none absolute -bottom-10 right-[3%] z-10 w-[24%] min-w-24 rounded-[1.5rem] lg:w-[19%]">
            <PhoneShot accent={accent.id} alt={index === 0 ? phoneAlt : ""} />
          </div>
        </div>)}
      </div>
    </div>

    <div className="mt-4 flex items-center justify-center gap-4 lg:mt-6">
      <button type="button" onClick={() => step(-1)} disabled={active === 0} aria-label="Previous theme" className="welcome-ghost hidden size-10 place-items-center sm:grid rounded-full transition-opacity disabled:opacity-40 sm:size-10"><ChevronLeft className="size-4" aria-hidden="true" /></button>
      {/* Phones: no arrows (the strip swipes) and no gaps, so all eight dots fit one line. */}
      <div role="group" aria-label="Colour themes" className="flex items-center justify-center sm:gap-1.5">
        {ACCENTS.map((accent, index) => {
          const selected = index === active;
          return <button
            key={accent.id}
            type="button"
            onClick={() => scrollToIndex(index)}
            aria-label={`${accent.label} theme`}
            aria-current={selected || undefined}
            title={accent.label}
            className={cn("theme-dot grid size-[2.625rem] place-items-center rounded-full sm:size-9", selected && "theme-dot-active")}
          >
            <span aria-hidden="true" className="accent-swatch block size-5 rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.12)] transition-transform duration-300 sm:size-[1.125rem]" style={{ "--swatch-a": accent.swatch[0], "--swatch-b": accent.swatch[1] } as CSSProperties} />
          </button>;
        })}
      </div>
      <button type="button" onClick={() => step(1)} disabled={active === ACCENTS.length - 1} aria-label="Next theme" className="welcome-ghost hidden size-10 place-items-center sm:grid rounded-full transition-opacity disabled:opacity-40 sm:size-10"><ChevronRight className="size-4" aria-hidden="true" /></button>
    </div>
    {/* No visible caption (Sandeep removed it, 2026-11-24); screen readers still hear the theme change. */}
    <p aria-live="polite" className="sr-only">{current.label} theme</p>
  </div>;
}
