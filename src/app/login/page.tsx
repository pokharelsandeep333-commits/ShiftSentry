import { Suspense, ViewTransition } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Brand } from "@/components/brand";
import { HeroChips } from "@/components/welcome/hero-chips";
import { SignInPanel } from "./sign-in-panel";

/**
 * Sign in: one box in the middle of the landing page's lavender ground, on the
 * landing's glass disc, with its example-week chips floating around it on
 * large screens. No second sales pitch -- the front page already makes it --
 * and a way back home at the top.
 *
 * Everything that reaches /login keeps working: `?next=` (invite links,
 * protected routes) and `?error=` (the OAuth callback) are read by
 * `LoginForm`; `?mode=signup` opens the box on Create account, and is what
 * every "Get started" on the landing sends. A signed-in visitor never sees
 * this page: `src/proxy.ts` sends them on.
 *
 * Arriving from the front page, the button that was clicked opens into the box:
 * the box is permanently named `sign-in-box` (globals.css), and `SignInLink`
 * gives the clicked button the same name, so the browser's View Transitions
 * API morphs one into the other while the landing fades out. Leaving by the
 * links back home (the `to-home` transition type), the page fades out over the
 * landing. React runs a boundary's enter and exit only when the
 * `<ViewTransition>` sits above every DOM node of the page, which is why the
 * one boundary here wraps the whole page rather than its parts. Untyped
 * navigations (browser Back, the redirect after signing in) do not animate.
 */
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Sign in | ShiftSentry",
  description: "Sign in to ShiftSentry to plan shifts under your weekly hour limit.",
};

const toHome = ["to-home"];

export default function LoginPage() {
  return <ViewTransition exit={{ "to-home": "login-leave", default: "none" }} default="none">
    <div className="welcome-page relative flex min-h-dvh flex-col overflow-x-clip">
      {/* From lg the header floats over the page instead of taking height, so
          the box is centred in the whole window; it sits clear of the box's
          sides there. */}
      <header className="relative z-10 mx-auto flex w-full max-w-[96rem] items-center justify-between gap-4 px-4 pt-4 sm:px-8 sm:pt-6 lg:absolute lg:inset-x-0 lg:top-0 lg:px-12 short:sm:pt-4">
        <Link href="/" transitionTypes={toHome} aria-label="ShiftSentry home" className="rounded-xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--primary-soft)]">
          <Brand size="compact" markClassName="size-9 rounded-xl" className="gap-2.5 text-[1.0625rem]" />
        </Link>
        <Link href="/" transitionTypes={toHome} className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm font-medium text-[var(--muted-foreground)] transition-colors hover:bg-[var(--primary-soft)] hover:text-[var(--foreground)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--primary-soft)]"><ArrowLeft className="size-4" />Back to home</Link>
      </header>

      <main className="relative flex flex-1 items-center justify-center px-4 py-6 sm:py-8 short:sm:py-4">
        {/* The landing's glass disc behind the box, and its example-week chips
            around it where there is room. Decoration only. */}
        <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 hidden aspect-square w-[min(42rem,90dvh)] -translate-x-1/2 -translate-y-1/2 sm:block">
          <div className="hero-disc absolute inset-0 rounded-full" />
        </div>
        <div aria-hidden="true" className="pointer-events-none absolute left-1/2 top-1/2 hidden h-[36rem] w-[60rem] -translate-x-1/2 -translate-y-1/2 lg:block">
          <HeroChips />
        </div>

        <div className="sign-in-box welcome-tint relative w-full max-w-[27rem] rounded-[1.75rem] p-6 sm:p-8">
          <Suspense><SignInPanel /></Suspense>
        </div>
      </main>

      <footer className="relative flex flex-wrap items-center justify-center gap-x-5 gap-y-1 px-4 pb-5 short:pb-3 text-xs text-[var(--muted-foreground)]">
        <Link href="/privacy" className="font-semibold transition-colors hover:text-[var(--foreground)]">Privacy Policy</Link>
        <span>© 2026 ShiftSentry</span>
      </footer>
    </div>
  </ViewTransition>;
}
