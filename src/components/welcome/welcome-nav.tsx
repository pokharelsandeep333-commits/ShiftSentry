"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BrandMark } from "@/components/brand";
import { SignInLink } from "@/components/welcome/sign-in-link";

/**
 * The landing page's top bar, built like joinhandshake.com's (structure only;
 * the colours are ours, and the bar and its buttons are pills). At the top of
 * the page it is a transparent row as wide as the content; once the page
 * scrolls it narrows to a card and folds the wordmark away, leaving the mark.
 * Styled in the welcome block of globals.css off `data-scrolled`.
 *
 * Scrolling is detected without a scroll listener: an IntersectionObserver
 * watches a small sentinel at the very top of the page (`.welcome-page` is its
 * positioned ancestor) and flips the flag when it leaves the viewport. The
 * server renders the unscrolled bar and so does the first client render, so
 * hydration matches; the observer's first callback then corrects a page that
 * was loaded already scrolled.
 *
 * The two buttons are `SignInLink`s, so the one clicked opens into the sign-in
 * box on /login. They prefetch in production, so the transition starts on the
 * click instead of after a round trip.
 */
const navLink = "whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--primary-soft)]";
const navButton = "inline-flex h-9 shrink-0 items-center whitespace-nowrap rounded-full px-3 text-sm font-semibold transition-[background-color,border-color] duration-200 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--primary-soft)] sm:px-4";

export function WelcomeNav() {
  const sentinel = useRef<HTMLSpanElement>(null);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const node = sentinel.current;
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setScrolled(!entry.isIntersecting));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return <>
    <span ref={sentinel} aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-10" />
    <header data-scrolled={scrolled ? "true" : undefined} className="welcome-nav fixed inset-x-0 top-4 z-40 px-3 sm:top-6 sm:px-6">
      <div className="welcome-nav-bar mx-auto flex h-14 items-center justify-between gap-2 rounded-full px-2.5 md:grid md:grid-cols-[1fr_auto_1fr]">
        <Link href="/" aria-label="ShiftSentry home" className="flex items-center justify-self-start rounded-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--primary-soft)]">
          <BrandMark size="default" className="size-9 rounded-xl" />
          <span className="welcome-nav-word font-display text-[1.0625rem] font-semibold text-[var(--foreground)]">ShiftSentry</span>
        </Link>
        <nav aria-label="Page" className="hidden items-center gap-1 md:flex">
          <a href="#week" className={navLink}>How it works</a>
          <a href="#rules" className={navLink}>Rules</a>
          <Link href="/privacy" className={navLink}>Privacy</Link>
        </nav>
        <div className="flex items-center gap-2 justify-self-end">
          {/* Plain --border vanishes on the lavender ground while the bar is transparent, so the outline
              takes a little violet. */}
          <SignInLink href="/login" prefetch className={`${navButton} border border-[color-mix(in_srgb,var(--primary)_22%,var(--border))] bg-transparent hover:bg-[var(--primary-soft)]`}>Sign in</SignInLink>
          <SignInLink href="/login?mode=signup" prefetch className={`${navButton} bg-[var(--primary)] text-[var(--primary-foreground)] hover:bg-[color-mix(in_srgb,var(--primary)_88%,var(--foreground))]`}>Get started</SignInLink>
        </div>
      </div>
    </header>
  </>;
}
