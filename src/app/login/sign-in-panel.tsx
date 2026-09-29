"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { LoginForm, type SignInMode } from "./login-form";

const COPY: Record<SignInMode, { title: string; lead: string }> = {
  signin: { title: "Welcome back", lead: "Sign in to manage your hours and upcoming shifts." },
  signup: { title: "Create your account", lead: "Add your jobs and your weekly limit. ShiftSentry does the counting." },
};

/**
 * What the sign-in box holds: a heading and the form, switching together
 * between Sign in and Create account.
 *
 * The mode is read from the address (`?mode=signup`), never kept as separate
 * state, so every way in agrees with it: "Get started" always opens Create
 * account and "Sign in" always opens Sign in, however the visitor arrived. A
 * switch writes the address with `history.replaceState`, which Next keeps
 * `useSearchParams` in step with, without a server round trip; `next` stays,
 * and a stale `?error` goes, since the message it raised is cleared. A refresh
 * or a shared link therefore opens the same form.
 *
 * `data-switched` is set on the first switch only, so the swap animations in
 * globals.css (`.mode-swap`) play on a switch and not on page load, and
 * `data-mode` gives them their direction.
 */
export function SignInPanel() {
  const search = useSearchParams();
  const mode: SignInMode = search.get("mode") === "signup" ? "signup" : "signin";
  const [switched, setSwitched] = useState(false);

  function changeMode(nextMode: SignInMode) {
    setSwitched(true);
    const url = new URL(window.location.href);
    if (nextMode === "signup") url.searchParams.set("mode", "signup");
    else url.searchParams.delete("mode");
    url.searchParams.delete("error");
    window.history.replaceState(null, "", url);
  }

  return <div data-mode={mode} data-switched={switched ? "true" : undefined}>
    <div key={mode} className="mode-swap">
      <h1 className="font-display text-[1.75rem] font-semibold leading-tight sm:text-[2rem]">{COPY[mode].title}</h1>
      <p className="mt-1.5 text-[15px] leading-6 text-[var(--muted-foreground)]">{COPY[mode].lead}</p>
    </div>
    <div className="mt-7">
      <LoginForm mode={mode} onModeChange={changeMode} />
    </div>
  </div>;
}
