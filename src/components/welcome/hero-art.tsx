"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { preload } from "react-dom";

/**
 * The hero render and the chips that label it. Their entrances (`.hero-art`
 * and `.hero-chip` in globals.css) are held paused until the image has
 * loaded, so the chips never pop in around an empty disc on a slow
 * connection. The flag is a DOM attribute rather than React state: it is set
 * once and nothing renders from it.
 *
 * A cached image can finish loading before hydration attaches `onLoad`, so the
 * effect also checks `complete`; the timer releases the motion anyway if the
 * image never arrives, so the chips are not hidden for good.
 *
 * Eager, not `priority`: the page's largest paint is the hero's text, and
 * `priority` fetched this render at high priority, ahead of what that text
 * needs. React still sends a preload hint for an eager image, but at the
 * browser's ordinary image priority, which it raises once the art is in view.
 *
 * A plain `<img>` because the art is served unoptimized and `next/image` drops
 * `srcSet` then. The widths are the `variants` `render-welcome-3d.mjs` writes
 * beside the 1400px render: a phone draws the hero about 350px wide, so it
 * takes the 720 (75 KB) at 2x and the 1080 at 3x instead of all 206 KB.
 *
 * Inside a `<picture>`: an AVIF `<source>` first (the same widths, 57 to 63%
 * smaller), the webp `<img>` as the fallback. React sends no preload hint for
 * an `<img>` inside a `<picture>`, since it cannot know which source the
 * browser picks, so the hint is sent here by hand for the AVIF set. Its
 * `type` makes a browser without AVIF skip it rather than fetch a file it
 * cannot use, and it carries the same `sizes`, so it asks for the file the
 * `<source>` will pick.
 */
const RELEASE_AFTER_MS = 2_500;
const VARIANT_WIDTHS = [720, 1080];
const SIZES = "(min-width: 1024px) 50vw, 90vw";

export function HeroArt({ src, alt, children }: { src: string; alt: string; children: ReactNode }) {
  const avifSrcSet = srcSetFor(src, "avif");
  preload(src.replace(/\.webp$/, ".avif"), { as: "image", type: "image/avif", imageSrcSet: avifSrcSet, imageSizes: SIZES });
  const art = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (image.current?.complete) markLoaded(art.current);
    const timer = setTimeout(() => markLoaded(art.current), RELEASE_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  return <div ref={art} className="hero-art relative lg:-mr-[4%] lg:-ml-[2%]">
    <div className="hero-art-float">
      <picture>
        <source type="image/avif" srcSet={avifSrcSet} sizes={SIZES} />
        <img ref={image} src={src} srcSet={srcSetFor(src, "webp")} sizes={SIZES} width={1400} height={1400} alt={alt} loading="eager" decoding="async" className="h-auto w-full" onLoad={() => markLoaded(art.current)} />
      </picture>
    </div>
    {children}
  </div>;
}

/** `/welcome/hero-3d.webp` → its `-720` and `-1080` copies, then the full 1400, in one format. */
function srcSetFor(src: string, format: "webp" | "avif") {
  const base = src.replace(/\.webp$/, "");
  return [...VARIANT_WIDTHS.map((width) => `${base}-${width}.${format} ${width}w`), `${base}.${format} 1400w`].join(", ");
}

function markLoaded(node: HTMLDivElement | null) {
  node?.setAttribute("data-loaded", "");
}
