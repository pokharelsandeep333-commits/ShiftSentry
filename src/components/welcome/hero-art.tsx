"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { preload } from "react-dom";
import styles from "./hero-art.module.css";

/**
 * The hero render and the chips that label it. The disc shows a lavender
 * gradient immediately. The render and chip entrances wait for the image,
 * which also triggers the placeholder fade.
 *
 * A cached image can finish loading before hydration attaches `onLoad`, so the
 * effect also checks `complete` and `naturalWidth`. The timer releases the
 * entrances if the image is slow or fails, while the placeholder stays visible.
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
  const frame = useRef<HTMLDivElement>(null);
  const art = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLImageElement>(null);

  function imageLoaded() {
    frame.current?.setAttribute("data-image-loaded", "");
    art.current?.setAttribute("data-loaded", "");
  }

  useEffect(() => {
    if (image.current?.complete && image.current.naturalWidth > 0) {
      imageLoaded();
      return;
    }
    const timer = setTimeout(() => art.current?.setAttribute("data-loaded", ""), RELEASE_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  return <div ref={frame} className="relative">
    <div aria-hidden="true" className={`hero-disc absolute left-1/2 top-1/2 aspect-square w-[86%] -translate-x-1/2 -translate-y-1/2 rounded-full ${styles.disc}`} />
    <div ref={art} className="hero-art relative lg:-mr-[4%] lg:-ml-[2%]">
      <div className="hero-art-float">
        <picture>
          <source type="image/avif" srcSet={avifSrcSet} sizes={SIZES} />
          <img ref={image} src={src} srcSet={srcSetFor(src, "webp")} sizes={SIZES} width={1400} height={1400} alt={alt} loading="eager" decoding="async" className="h-auto w-full" onLoad={imageLoaded} />
        </picture>
      </div>
      {children}
    </div>
  </div>;
}

/** `/welcome/hero-3d.webp` → its `-720` and `-1080` copies, then the full 1400, in one format. */
function srcSetFor(src: string, format: "webp" | "avif") {
  const base = src.replace(/\.webp$/, "");
  return [...VARIANT_WIDTHS.map((width) => `${base}-${width}.${format} ${width}w`), `${base}.${format} 1400w`].join(", ");
}
