import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight, CalendarClock, Layers, Smartphone, Wallet } from "lucide-react";
import { Brand } from "@/components/brand";
import { HeroArt } from "@/components/welcome/hero-art";
import { HeroChips } from "@/components/welcome/hero-chips";
import { RulesBento } from "@/components/welcome/rule-previews";
import { SignInLink } from "@/components/welcome/sign-in-link";
import { WeekGauge } from "@/components/welcome/week-gauge";
import { WelcomeNav } from "@/components/welcome/welcome-nav";
import { isGoogleCalendarEnabled } from "@/lib/google/config";
import { cn } from "@/lib/utils";

/**
 * The public landing page, rendered by `/welcome`, which `src/proxy.ts` serves
 * at `/` to anyone signed out, so the site's root explains the app instead of
 * being a login wall (Google's OAuth consent-screen review requires that of the
 * home page URL). "Sign in" goes to /login; "Get started" goes to
 * /login?mode=signup, which opens the same form on "Create account".
 *
 * Every rule and number stated below is enforced by the app or the database:
 * the 80/90/100 warning ladder (`dashboard.ts`), the 24 hour shift limit
 * (`validation.ts` and the `shifts_valid_interval` check), the overlap
 * exclusion constraint, and `week_starts_on` 0 to 6. Change the copy in the same
 * change as the rule.
 *
 * Layout: a fixed nav that turns into a card once the page scrolls
 * (`WelcomeNav`), the hero straight on the page's lavender ground, then every
 * other section on its own frosted white panel, stacked with small gaps (the
 * surfaces are described in the welcome block of globals.css).
 *
 * Images in `public/welcome/`:
 * - `hero-3d.webp`, `cta-3d.webp`: rendered by `scripts/render-welcome-3d.mjs`
 *   from `scripts/welcome-3d/scene.html`. Re-render there, never edit the webp.
 * - `dashboard-*.webp`: the demo dashboard (what `demoDashboard` renders with no
 *   Supabase configured) captured at 2x in both themes, shown through the
 *   `.theme-light-only` / `.theme-dark-only` pair. Recapture when its look changes.
 * All are pre-compressed at display size, so `next/image` serves them
 * unoptimized and nothing depends on the image optimizer in the container.
 *
 * Motion is CSS only (the welcome block in globals.css) and plays whatever
 * the visitor's reduced-motion setting. The links to /login are
 * `SignInLink`s: the one clicked opens into the sign-in box (see
 * `src/app/login/page.tsx`).
 */
const CAPABILITIES = [
  { icon: Layers, title: "All your jobs, one week", body: "One weekly limit across every job, plus an optional cap for each job." },
  { icon: CalendarClock, title: "Planned shifts count now", body: "Schedule Friday on Monday and it counts toward this week straight away." },
  { icon: Wallet, title: "Take-home, to the cent", body: "Hourly rate, tax and deductions per job, so you see net pay, not a guess." },
  { icon: Smartphone, title: "On your phone", body: "Installs to your home screen. Sign in with Google, GitHub, or email." },
];

/* Section headings stay mid-sized and calm; only the hero is large. */
const sectionTitle = "font-display text-[1.85rem] font-semibold leading-[1.12] [text-wrap:balance] sm:text-[2.25rem] lg:text-[2.5rem]";

/* One panel radius for every section, and one content width (`.welcome-container`,
   which grows on wide screens) for panels, hero and nav alike. */
const panel = "welcome-panel welcome-container mx-auto rounded-[1.5rem]";

/* `py-1` lifts each link past the 24px minimum touch target without spreading the columns. */
const footerLink = "inline-block py-1 text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]";

export function WelcomeLanding() {
  const calendarEnabled = isGoogleCalendarEnabled();

  return <div className="welcome-page relative overflow-x-clip">
      <WelcomeNav />

      <main>
        {/* The nav is fixed, so the hero's top padding is what clears it. */}
        <section className="welcome-hero relative px-3 pb-28 pt-28 sm:px-6 sm:pt-28 lg:pb-28 lg:pt-24 2xl:pt-28">
          <div className="welcome-container mx-auto grid items-center gap-10 px-5 sm:px-9 lg:grid-cols-12 lg:gap-6 lg:px-10">
            <div className="lg:col-span-6">
              <h1 className="font-display text-[2.4rem] font-semibold leading-[1.04] sm:text-[3.1rem] lg:text-[3.75rem] 2xl:text-[4.25rem]">
                <span className="hero-line block"><span>Every job,</span></span>
                <span className="hero-line block"><span>every shift,</span></span>
                <span className="hero-line block text-[var(--primary)]"><span>under your limit.</span></span>
              </h1>
              <p className="hero-fade mt-6 max-w-[27rem] text-[15px] leading-7 text-[var(--muted-foreground)] sm:text-base 2xl:max-w-[30rem] 2xl:text-[1.0625rem] 2xl:leading-8">A work hours tracker for students and anyone with more than one job. ShiftSentry warns you at 80% and refuses any shift that would push you over.</p>
              <div className="hero-fade mt-8 flex flex-wrap items-center gap-2.5">
                <Pill prefetch>Get started</Pill>
                <a href="#week" className="welcome-ghost inline-flex h-12 items-center whitespace-nowrap rounded-full px-5 text-sm font-semibold transition-[background-color,border-color,transform] duration-300 ease-out hover:-translate-y-0.5">Try the example week</a>
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-[34rem] lg:col-span-6 lg:max-w-none">
              <div aria-hidden="true" className="hero-disc absolute left-1/2 top-1/2 aspect-square w-[86%] -translate-x-1/2 -translate-y-1/2 rounded-full" />
              <HeroArt src="/welcome/hero-3d.webp" alt="An iridescent lavender glass ribbon loops around a violet bead beside a clear glass sphere, with small lilac, mint and amber accents.">
                <HeroChips />
              </HeroArt>
            </div>
          </div>
        </section>

        <div className="relative z-10 -mt-20 space-y-4 px-3 sm:space-y-5 sm:px-6">
          <section aria-labelledby="capabilities-title">
            <h2 id="capabilities-title" className="sr-only">What ShiftSentry does</h2>
            <ul className={cn(panel, "grid gap-7 p-5 py-7 sm:grid-cols-2 sm:p-9 lg:grid-cols-4 lg:gap-0 lg:p-10")}>
              {CAPABILITIES.map(({ icon: Icon, title, body }) => <li key={title} className="lg:border-l lg:px-7 lg:first:border-l-0 lg:first:pl-0 lg:last:pr-0">
                <span className="grid size-10 place-items-center rounded-xl bg-[var(--primary-soft)] text-[var(--primary)]"><Icon className="size-[1.125rem]" strokeWidth={1.8} /></span>
                <h3 className="mt-4 font-display text-base font-semibold leading-snug">{title}</h3>
                <p className="mt-1.5 text-sm leading-6 text-[var(--muted-foreground)]">{body}</p>
              </li>)}
            </ul>
          </section>

          <section id="rules" aria-labelledby="rules-title" className={cn(panel, "scroll-mt-24 p-3 pt-9 sm:p-5 sm:pt-12 lg:pt-14")}>
            <h2 id="rules-title" className={cn(sectionTitle, "px-5 sm:px-7")}>The rules it keeps for you.</h2>
            <div className="mt-7 sm:mt-10"><RulesBento week={<WeekGauge />} /></div>
          </section>

          <section aria-labelledby="dashboard-title" className={cn(panel, "grid items-center gap-10 px-5 py-9 sm:p-10 lg:grid-cols-12 lg:gap-10 lg:p-12")}>
            <div className="lg:col-span-4">
              <h2 id="dashboard-title" className={sectionTitle}>Your whole week on one screen.</h2>
              <p className="mt-4 text-[15px] leading-7 text-[var(--muted-foreground)] sm:text-base">Logged and planned hours against your cap, net pay by job, and the last six months at a glance.</p>
              {calendarEnabled && <p className="mt-3 text-[15px] leading-7 text-[var(--muted-foreground)] sm:text-base">Connect Google Calendar to spot clashes with class. Access is read-only, and nothing is written to Google.</p>}
            </div>
            <figure className="relative pb-10 lg:col-span-8 lg:pb-12">
              <div className="rv rv-rise welcome-frame rounded-[1.25rem] p-1.5 sm:p-2">
                <Screenshot name="dashboard-desktop" width={1440} height={900} alt="The ShiftSentry dashboard with sample data: 16 of 20 weekly hours planned, warnings at 80% of the weekly limit and 92% of one job's cap, and $136.40 earned after tax." className="rounded-[0.9rem]" sizes="(min-width: 1024px) 45rem, 92vw" />
              </div>
              <div className="rv rv-rise welcome-phone absolute -bottom-2 right-[-2%] w-[26%] min-w-28 rounded-[1.5rem]">
                <Screenshot name="dashboard-mobile" width={390} height={844} alt="The same dashboard on a phone." className="rounded-[1.15rem]" sizes="12rem" />
              </div>
              {/* Kept clear of the phone, which is taller than the frame on small screens. */}
              <figcaption className="mt-4 max-w-[calc(100%-8.5rem)] text-[13px] text-[var(--muted-foreground)]">Dashboard shown with sample data.</figcaption>
            </figure>
          </section>

          <section aria-labelledby="start-title" className="welcome-tint welcome-container mx-auto grid items-center gap-6 overflow-hidden rounded-[1.5rem] px-5 py-9 sm:px-10 md:grid-cols-2 lg:px-14">
            <Image src="/welcome/cta-3d.webp" width={1200} height={1000} alt="" unoptimized sizes="(min-width: 768px) 40vw, 80vw" className="rv rv-rise mx-auto h-auto w-full max-w-sm" />
            <div className="pb-4 md:pb-0">
              <h2 id="start-title" className={sectionTitle}>Start with this week.</h2>
              <p className="mt-3 max-w-[25rem] text-[15px] leading-7 text-[var(--muted-foreground)] sm:text-base">Add your jobs and your hour limit. ShiftSentry does the counting.</p>
              <div className="mt-7"><Pill>Get started</Pill></div>
              <p className="mt-4 text-[13px] text-[var(--muted-foreground)]">Your work schedule stays private.</p>
            </div>
          </section>
        </div>
      </main>

      <footer className="px-3 pb-3 pt-4 sm:px-6 sm:pb-6 sm:pt-5">
        <div className={cn(panel, "px-6 sm:px-10 lg:px-12")}>
          <div className="grid gap-9 pb-8 pt-10 md:grid-cols-[1.6fr_1fr_1fr_1fr]">
            <div>
              <Brand size="compact" markClassName="size-7 rounded-lg" className="gap-2 text-sm" />
              <p className="mt-4 max-w-[18rem] text-sm leading-6 text-[var(--muted-foreground)]">A work hours tracker for students and anyone with more than one job.</p>
            </div>
            <FooterColumn title="Product">
              <li><a href="#week" className={footerLink}>How it works</a></li>
            </FooterColumn>
            <FooterColumn title="Account">
              <li><SignInLink href="/login" className={footerLink}>Sign in</SignInLink></li>
              <li><SignInLink href="/login?mode=signup" className={footerLink}>Get started</SignInLink></li>
            </FooterColumn>
            <FooterColumn title="Legal">
              <li><Link href="/privacy" className={footerLink}>Privacy Policy</Link></li>
              <li><Link href="/terms" className={footerLink}>Terms of Service</Link></li>
            </FooterColumn>
          </div>
          <p className="border-t py-5 text-[13px] text-[var(--muted-foreground)]">© 2026 ShiftSentry</p>
        </div>
      </footer>
  </div>;
}

/**
 * The app's primary button as a pill, with a round disc holding the arrow. Goes
 * to account creation. `prefetch` (the hero pill) fetches the page ahead in
 * production, so the transition starts on the click instead of after a round trip.
 */
function Pill({ children, prefetch }: { children: ReactNode; prefetch?: boolean }) {
  return <SignInLink href="/login?mode=signup" prefetch={prefetch} className="welcome-pill group inline-flex h-12 shrink-0 items-center gap-2.5 whitespace-nowrap rounded-full pl-5 pr-1.5 text-[15px] font-semibold transition-transform duration-300 ease-out hover:-translate-y-0.5 active:translate-y-px">
    {children}
    <span className="pill-disc grid size-9 place-items-center rounded-full"><ArrowUpRight className="size-4" /></span>
  </SignInLink>;
}

function FooterColumn({ title, children }: { title: string; children: ReactNode }) {
  return <div>
    <h2 className="text-[13px] font-semibold">{title}</h2>
    <ul className="mt-3.5 space-y-2.5 text-sm">{children}</ul>
  </div>;
}

/** One screenshot in both themes; CSS shows the one matching the `.dark` class. */
function Screenshot({ name, width, height, alt, className, sizes }: { name: string; width: number; height: number; alt: string; className?: string; sizes: string }) {
  return <>
    <Image src={`/welcome/${name}-light.webp`} width={width} height={height} alt={alt} sizes={sizes} unoptimized className={cn("theme-light-only h-auto w-full", className)} />
    <Image src={`/welcome/${name}-dark.webp`} width={width} height={height} alt="" aria-hidden="true" sizes={sizes} unoptimized className={cn("theme-dark-only h-auto w-full", className)} />
  </>;
}
