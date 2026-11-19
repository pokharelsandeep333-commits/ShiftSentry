"use client";

import { useLayoutEffect } from "react";

const dirtyForms = new Set<symbol>();
let confirmedClick: MouseEvent | null = null;

function warnBeforeUnload(event: BeforeUnloadEvent) {
  // Plain same-origin links can unload the page after the capture handler has
  // already asked. Next Link prevents the native click for client navigation.
  if (confirmedClick && !confirmedClick.defaultPrevented) return;
  event.preventDefault();
  event.returnValue = true;
}

function confirmLinkNavigation(event: MouseEvent) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;

  const anchor = event.target instanceof Element ? event.target.closest("a[href]") : null;
  if (!(anchor instanceof HTMLAnchorElement) || anchor.hasAttribute("download")) return;
  if (anchor.target && anchor.target.toLowerCase() !== "_self") return;

  const destination = new URL(anchor.href);
  const current = window.location;
  if (destination.origin !== current.origin) return;
  if (destination.pathname === current.pathname && destination.search === current.search) return;

  if (!window.confirm("You have unsaved settings changes. Leave this page?")) {
    event.preventDefault();
    event.stopPropagation();
    return;
  }

  confirmedClick = event;
  window.setTimeout(() => {
    if (confirmedClick === event) confirmedClick = null;
  }, 500);
}

export function useSettingsFormDirty(dirty: boolean) {
  useLayoutEffect(() => {
    if (!dirty) return;

    const form = Symbol();
    dirtyForms.add(form);
    if (dirtyForms.size === 1) {
      window.addEventListener("beforeunload", warnBeforeUnload);
      document.addEventListener("click", confirmLinkNavigation, true);
    }

    return () => {
      dirtyForms.delete(form);
      if (dirtyForms.size > 0) return;
      window.removeEventListener("beforeunload", warnBeforeUnload);
      document.removeEventListener("click", confirmLinkNavigation, true);
      confirmedClick = null;
    };
  }, [dirty]);
}
