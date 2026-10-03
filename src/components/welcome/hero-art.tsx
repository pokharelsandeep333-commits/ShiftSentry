"use client";

import { useEffect, useRef, type ReactNode } from "react";
import Image from "next/image";

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
 */
const RELEASE_AFTER_MS = 2_500;

export function HeroArt({ src, alt, children }: { src: string; alt: string; children: ReactNode }) {
  const art = useRef<HTMLDivElement>(null);
  const image = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (image.current?.complete) markLoaded(art.current);
    const timer = setTimeout(() => markLoaded(art.current), RELEASE_AFTER_MS);
    return () => clearTimeout(timer);
  }, []);

  return <div ref={art} className="hero-art relative lg:-mr-[4%] lg:-ml-[2%]">
    <div className="hero-art-float">
      <Image ref={image} src={src} width={1400} height={1400} alt={alt} priority unoptimized sizes="(min-width: 1024px) 50vw, 90vw" className="h-auto w-full" onLoad={() => markLoaded(art.current)} />
    </div>
    {children}
  </div>;
}

function markLoaded(node: HTMLDivElement | null) {
  node?.setAttribute("data-loaded", "");
}
