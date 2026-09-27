import type { ReactNode } from "react";
import Link from "next/link";
import { ArrowRight, BellRing, CalendarClock, Globe, Layers, LockKeyhole, ShieldCheck, Smartphone } from "lucide-react";
import { Brand } from "@/components/brand";
import { buttonVariants } from "@/components/ui/button";
import { WeekGauge } from "@/components/welcome/week-gauge";
import { cn } from "@/lib/utils";

/**
 * The public home page. `src/proxy.ts` rewrites a signed-out visit to `/` here,
 * so the site's root explains the app instead of bouncing to /login -- which
 * Google's OAuth consent-screen review requires of the home page URL. Signed-in
 * visitors never see it at `/`; they get their dashboard.
 *
 * Every rule stated below is enforced by the app or the database. Change the
 * copy in the same change as the rule.
 */
export const metadata = {
  title: "ShiftSentry | Plan shifts under your weekly hour limit",
  description: "ShiftSentry tracks shifts across your jobs, warns you before you pass your weekly hour limit, and shows what you earned after tax.",
};

const RULES: { icon: typeof BellRing; title: string; body: ReactNode }[] = [
  { icon: CalendarClock, title: "Planned shifts count now.", body: "A shift you schedule for Friday counts toward this week the moment you add it, so the limit is in view before you work it." },
  { icon: BellRing, title: "A warning at 80%, a stop at the limit.", body: "You are told when your hours reach 80% of your limit. A shift that would go past it is refused by the database, not just the form." },
  { icon: Layers, title: "No double-booking.", body: "Two shifts cannot overlap, even across different jobs. Back-to-back is fine." },
  { icon: Globe, title: "Your week, your time zone.", body: "Choose the day your week starts. A shift that runs past midnight is split between the two days it touches." },
  { icon: LockKeyhole, title: "Pay is locked when you work it.", body: "Each shift keeps its rate, tax and deductions. A raise next month does not rewrite last month." },
  { icon: ShieldCheck, title: "Your schedule is yours.", body: <>Other ShiftSentry users cannot see your jobs or shifts. <Link href="/privacy" className="font-semibold text-[var(--primary)] underline decoration-[color-mix(in_srgb,var(--primary)_40%,transparent)] underline-offset-4 transition-colors hover:decoration-[var(--primary)]">Read the privacy policy</Link>.</> },
];

export default function WelcomePage() {
  return <div className="overflow-x-clip">
    <header className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-5 sm:px-8">
      <Link href="/" aria-label="ShiftSentry home" className="rounded-2xl focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--primary-soft)]"><Brand /></Link>
      <nav className="flex items-center gap-1 sm:gap-2">
        <Link href="/privacy" className={cn(buttonVariants({ variant: "ghost" }), "hidden sm:inline-flex")}>Privacy</Link>
        <Link href="/login" className={buttonVariants({ variant: "outline" })}>Sign in</Link>
      </nav>
    </header>

    <main>
      <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-20 pt-8 sm:px-8 lg:grid-cols-12 lg:gap-10 lg:pb-28 lg:pt-14">
        <div className="lg:col-span-5">
          <h1 className="font-display text-5xl font-semibold leading-[1.02] [text-wrap:balance] sm:text-6xl lg:text-[4.35rem]">Hours, without surprises.</h1>
          <p className="mt-6 max-w-[34rem] text-lg leading-8 text-[var(--muted-foreground)]">ShiftSentry is a shift planner for students and anyone working hourly jobs. Log shifts across every job, see your week against your hour limit before you reach it, and know what you take home after tax.</p>
          <div className="mt-9 flex flex-wrap items-center gap-x-5 gap-y-3">
            <Link href="/login" className={buttonVariants({ size: "lg" })}>Get started<ArrowRight className="size-4" /></Link>
            <p className="text-sm text-[var(--muted-foreground)]">Have an account? <Link href="/login" className="font-semibold text-[var(--primary)] underline-offset-4 hover:underline">Sign in</Link></p>
          </div>
          <p className="mt-10 flex items-center gap-2.5 text-sm text-[var(--muted-foreground)]"><ShieldCheck className="size-4 shrink-0 text-[var(--primary)]" />Your work schedule stays private.</p>
        </div>

        <div className="relative lg:col-span-7">
          <div className="relative overflow-hidden rounded-[2.25rem] bg-[var(--primary)] p-3 sm:p-10 lg:p-12">
            <div className="login-orb login-orb--one" />
            <div className="login-orb login-orb--two" />
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.1),transparent_45%,rgba(20,13,91,0.18))]" />
            <div className="relative"><WeekGauge /></div>
          </div>
        </div>
      </section>

      <section aria-labelledby="rules-title" className="border-t bg-[color-mix(in_srgb,var(--card)_55%,transparent)]">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-8 lg:py-28">
          <div className="grid gap-6 lg:grid-cols-12">
            <h2 id="rules-title" className="font-display text-4xl font-semibold leading-tight [text-wrap:balance] sm:text-5xl lg:col-span-5">The rules it keeps for you.</h2>
            <p className="max-w-[36rem] text-lg leading-8 text-[var(--muted-foreground)] lg:col-span-6 lg:col-start-7 lg:pt-2">The example week above follows them too. These are the checks ShiftSentry runs on every shift you add.</p>
          </div>
          <dl className="mt-14 grid gap-x-12 sm:grid-cols-2 lg:grid-cols-3">
            {RULES.map(({ icon: Icon, title, body }) => <div key={title} className="border-t py-8">
              <dt className="flex items-center gap-3 font-display text-xl font-semibold"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]"><Icon className="size-5" /></span>{title}</dt>
              <dd className="mt-3 leading-7 text-[var(--muted-foreground)]">{body}</dd>
            </div>)}
          </dl>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-20 sm:px-8 lg:py-24">
        <div className="relative overflow-hidden rounded-[2.25rem] bg-[var(--primary)] px-6 py-14 text-[var(--primary-foreground)] sm:px-12 lg:px-16 lg:py-20">
          <div className="login-orb login-orb--one" />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.1),transparent_45%,rgba(20,13,91,0.18))]" />
          <div className="relative grid items-end gap-10 lg:grid-cols-12">
            <div className="lg:col-span-8">
              <h2 className="font-display text-4xl font-semibold leading-tight [text-wrap:balance] sm:text-5xl">Start with this week.</h2>
              <p className="mt-5 max-w-[36rem] text-lg leading-8 opacity-85">Add your jobs and your hour limit. ShiftSentry does the counting, on your laptop or your phone.</p>
              <p className="mt-6 flex items-center gap-2 text-sm opacity-80"><Smartphone className="size-4 shrink-0" />Installs to your home screen. Sign in with Google, GitHub, or email.</p>
            </div>
            <div className="lg:col-span-4 lg:justify-self-end">
              <Link href="/login" className="inline-flex h-12 items-center gap-2 rounded-xl bg-white px-6 text-sm font-semibold text-[#3b2fa8] shadow-xl shadow-black/15 transition-transform duration-300 ease-out hover:-translate-y-0.5 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-white/40 active:translate-y-px">Get started<ArrowRight className="size-4" /></Link>
            </div>
          </div>
        </div>
      </section>
    </main>

    <footer className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 border-t px-4 py-8 text-sm text-[var(--muted-foreground)] sm:px-8">
      <Brand size="compact" />
      <nav className="flex items-center gap-6">
        <Link href="/privacy" className="transition-colors hover:text-[var(--foreground)]">Privacy Policy</Link>
        <Link href="/login" className="transition-colors hover:text-[var(--foreground)]">Sign in</Link>
      </nav>
      <p className="w-full sm:w-auto">© 2026 ShiftSentry</p>
    </footer>
  </div>;
}
