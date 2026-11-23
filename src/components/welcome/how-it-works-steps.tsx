"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * The "How it works" list. Each step's floating pieces and dashed connector
 * run a few cycles and stop (`.hiw-*` in globals.css), so they wait, paused,
 * until that step is on screen: this marks each `<li>` with `data-inview` the
 * first time it is a third visible, then stops watching it. The motion itself
 * stays in CSS. Without script the pieces simply rest where they start.
 */
export function HowItWorksSteps({ className, children }: { className: string; children: ReactNode }) {
  const list = useRef<HTMLOListElement>(null);

  useEffect(() => {
    const steps = Array.from(list.current?.children ?? []);
    if (typeof IntersectionObserver === "undefined") {
      steps.forEach((step) => step.setAttribute("data-inview", ""));
      return;
    }
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        entry.target.setAttribute("data-inview", "");
        observer.unobserve(entry.target);
      }
    }, { threshold: 0.33 });
    steps.forEach((step) => observer.observe(step));
    return () => observer.disconnect();
  }, []);

  return <ol ref={list} className={className}>{children}</ol>;
}
