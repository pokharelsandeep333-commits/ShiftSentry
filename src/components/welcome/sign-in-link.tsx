"use client";

import type { ComponentProps, MouseEvent } from "react";
import Link from "next/link";

const TO_LOGIN = ["to-login"];

// The one element on the page that currently carries the name. Two elements
// with the same view-transition-name make the browser abort the transition,
// so a new click takes the name from whichever link had it last.
let named: HTMLElement | null = null;

/**
 * A link from the landing to /login whose button opens into the sign-in box.
 * The box on /login is permanently named `sign-in-box` (globals.css); this
 * gives the same name to the clicked link, and only to it, just before Next
 * navigates, so the browser morphs one into the other. The landing has six
 * such links, and naming them all up front would be six duplicates.
 *
 * It also tags the navigation `to-login`, which is what fades the landing out
 * (src/app/welcome/page.tsx). A click that will not navigate here (modifier
 * keys, a new tab) names nothing. With reduced motion on, nothing is named
 * either: the box then just fades in, and the button fades with the page.
 */
export function SignInLink({ onClick, ...props }: Omit<ComponentProps<typeof Link>, "transitionTypes">) {
  function nameForMorph(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (named) named.style.viewTransitionName = "";
    named = event.currentTarget;
    named.style.viewTransitionName = "sign-in-box";
  }

  return <Link {...props} transitionTypes={TO_LOGIN} onClick={nameForMorph} />;
}
