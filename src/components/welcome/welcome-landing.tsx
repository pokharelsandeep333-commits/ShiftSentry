import { Suspense, type ComponentType, type CSSProperties, type ReactNode } from "react";
import dynamic from "next/dynamic";
import { ArrowUpRight, BriefcaseBusiness, Clock3, ShieldCheck, type LucideProps } from "lucide-react";
import { HeroArt } from "@/components/welcome/hero-art";
import { HeroChips } from "@/components/welcome/hero-chips";
import { HowItWorks } from "@/components/welcome/how-it-works";
import { WelcomeFooter } from "@/components/welcome/welcome-footer";
import { RulesBento } from "@/components/welcome/rule-previews";
import { SignInLink } from "@/components/welcome/sign-in-link";
import { faqItems, WelcomeFaq } from "@/components/welcome/welcome-faq";
import { WelcomeJsonLd } from "@/components/welcome/welcome-json-ld";
import { WelcomeNav } from "@/components/welcome/welcome-nav";
import { isGoogleCalendarEnabled } from "@/lib/google/config";
import { cn } from "@/lib/utils";
import { ACCENTS, captureName, SMALL_CAPTURE_SUFFIX, SMALL_CAPTURE_WIDTH } from "@/lib/accent";

/**
 * The public landing page, rendered by `/welcome`, which `src/proxy.ts` serves
 * at `/` to anyone signed out, so the site's root explains the app instead of
 * being a login wall (Google's OAuth consent-screen review requires that of the
 * home page URL). "Sign in" goes to /login; "Get started" goes to
 * /login?mode=signup, which opens the same form on "Create account".
 *
 * Every rule and number stated below is enforced by the app or the database:
 * the 80% warning and 100% limit (`week-meter.ts` and the weekly-limit trigger), the 24 hour shift limit
 * (`validation.ts` and the `shifts_valid_interval` check), the overlap
 * exclusion constraint, and `week_starts_on` 0 to 6. Change the copy in the same
 * change as the rule.
 *
 * Layout: a fixed nav that turns into a card once the page scrolls
 * (`WelcomeNav`), the hero straight on the page's lavender ground, then the
 * dashboard screenshots, also straight on the ground as the hero's product
 * shot (`.welcome-showcase`), then every other section on its own frosted
 * white panel, stacked with small gaps: the example week, how it works, the
 * rules, the questions (the surfaces are described in the welcome block of
 * globals.css).
 *
 * Images in `public/welcome/`:
 * - `hero-3d.webp` and its `hero-3d-<width>.webp` variants: rendered by
 *   `scripts/render-welcome-3d.mjs` from `scripts/welcome-3d/scene.html`.
 *   Re-render there, never edit the webp.
 * - `dashboard-*.webp`: the demo dashboard (what `demoDashboardFor` renders with no
 *   Supabase configured) captured in every colour theme and mode, shown through
 *   `.welcome-shot` (see `Screenshot`). Recapture when its look changes.
 * All are pre-compressed at display size and each has an `.avif` sibling, so
 * they are served as plain `<picture>`s (AVIF first, webp fallback) and
 * nothing depends on the image optimizer in the container.
 *
 * Everything below the hero, and the footer, sits in a `<Suspense>` boundary.
 * Nothing in it suspends, so the server HTML is complete, but React hydrates a
 * server-rendered boundary separately and at idle priority, after the content
 * outside it. The nav and the hero's buttons therefore become live first (about
 * 300 ms sooner at 4x CPU, measured 2026-11-18), and the sections below follow
 * when the main thread is free. A tap inside one before then makes React
 * hydrate that boundary at once and replay the event. `WeekGauge`, the only
 * interactive widget down there, is also its own chunk (`next/dynamic`, still
 * rendered on the server), so its code is not in the first scripts the page
 * evaluates. What remains of the landing's long tasks is React evaluating the
 * page's RSC payload, which these boundaries do not change.
 *
 * Motion is CSS only (the welcome block in globals.css) and plays whatever
 * the visitor's reduced-motion setting. The links to /login are
 * `SignInLink`s: the one clicked opens into the sign-in box (see
 * `src/app/login/page.tsx`).
 */
const WeekGauge = dynamic(() => import("@/components/welcome/week-gauge").then((module) => module.WeekGauge));

/* Section headings stay mid-sized and calm; only the hero is large. */
const sectionTitle = "font-display text-[1.85rem] font-semibold leading-[1.12] [text-wrap:balance] sm:text-[2.25rem] lg:text-[2.5rem]";

/* One panel radius for every section, and one content width (`.welcome-container`,
   which grows on wide screens) for panels, hero and nav alike. */
const panel = "welcome-panel welcome-container mx-auto rounded-[1.5rem]";

export function WelcomeLanding() {
  const calendarEnabled = isGoogleCalendarEnabled();
  const faq = faqItems(calendarEnabled);

  return <div className="welcome-page relative overflow-x-clip">
      <WelcomeJsonLd faq={faq} />
      <WelcomeNav />

      <main>
        {/* The nav is fixed, so the hero's top padding is what clears it. */}
        <section className="welcome-hero relative px-3 pb-10 pt-28 sm:px-6 sm:pt-28 lg:pb-6 lg:pt-24 2xl:pt-28">
          <div className="welcome-container mx-auto grid items-center gap-10 px-5 sm:px-9 lg:grid-cols-12 lg:gap-6 lg:px-10">
            <div className="lg:col-span-6">
              <h1 className="hero-title font-display text-[2.3rem] font-bold leading-[1.02] sm:text-[3.1rem] lg:text-[3.75rem] 2xl:text-[4.25rem]">
                <span className="hero-line block"><span>Every job, <HeadlineGlyph icon={BriefcaseBusiness} order={0} /></span></span>
                <span className="hero-line block"><span>every shift, <HeadlineGlyph icon={Clock3} order={1} /></span></span>
                <span className="hero-line block text-[var(--primary)]"><span>under your <HeadlineGlyph icon={ShieldCheck} order={2} /> limit.</span></span>
              </h1>
              <p className="hero-fade mt-6 max-w-[27rem] text-[15px] leading-7 text-[var(--muted-foreground)] sm:text-base 2xl:max-w-[30rem] 2xl:text-[1.0625rem] 2xl:leading-8">A work hours tracker for students and anyone with more than one job. ShiftSentry warns you at 80% and refuses any shift that would push you over.</p>
              <div className="hero-fade mt-8 flex flex-wrap items-center gap-2.5">
                <Pill prefetch>Get started</Pill>
                <a href="#week" className="welcome-ghost inline-flex h-12 items-center whitespace-nowrap rounded-full px-5 text-sm font-semibold transition-[background-color,border-color,transform] duration-300 ease-out hover:-translate-y-0.5">Try the example week</a>
              </div>
            </div>

            <div className="relative mx-auto w-full max-w-[34rem] lg:col-span-6 lg:max-w-none">
              <HeroArt src="/welcome/hero-3d.webp" alt="An iridescent lavender glass ribbon loops around a violet bead beside a clear glass sphere, with two small clocks in lilac and mint and an amber bead.">
                <HeroChips />
              </HeroArt>
            </div>
          </div>
        </section>

        <Suspense>
          {/* The product shot, straight after the hero with no heading: on the
              page itself, not in a panel, in the light glass frame. */}
          <section aria-label="The ShiftSentry dashboard" className="relative px-3 pb-16 sm:px-6 sm:pb-20 lg:pb-24">
            <div className="welcome-container mx-auto">
              <figure className="welcome-showcase relative pb-12 lg:pb-14">
                <div className="showcase-tilt welcome-frame rounded-[1.25rem] p-1.5 sm:rounded-[1.5rem] sm:p-2">
                  <Screenshot size="desktop" width={1440} height={952} alt="The ShiftSentry dashboard with sample data: 16 of 20 weekly hours planned with 4 hours left, one job close to its own cap, the next shift, and $136.40 earned after tax." className="rounded-[0.9rem] sm:rounded-[1.1rem]" />
                </div>
                <div className="welcome-phone absolute bottom-0 right-[2%] w-[24%] min-w-28 rounded-[1.5rem] sm:right-[3%] lg:w-[19%]">
                  <Screenshot size="mobile" width={390} height={844} alt="The same dashboard on a phone." className="rounded-[1.15rem]" />
                </div>
              </figure>
            </div>
          </section>

          <div className="relative z-10 space-y-4 px-3 sm:space-y-5 sm:px-6">
            <section id="week" aria-labelledby="week-heading" className={cn(panel, "scroll-mt-24 grid items-start gap-6 p-5 sm:p-9 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-12 lg:p-12")}>
              <div>
                <h2 id="week-heading" className={sectionTitle}>See what fits before you say yes.</h2>
                <p className="mt-4 max-w-sm text-[15px] leading-7 text-[var(--muted-foreground)]">Two jobs share a 20-hour cap in this example. Try adding a shift to see what fits.</p>
              </div>
              <WeekGauge />
            </section>

            <HowItWorks className={cn(panel, "scroll-mt-24 px-5 py-9 sm:p-10 lg:p-12")} titleClassName={sectionTitle} />

            <section id="rules" aria-labelledby="rules-title" className={cn(panel, "scroll-mt-24 p-3 pt-9 sm:p-5 sm:pt-12 lg:pt-14")}>
              <h2 id="rules-title" className={cn(sectionTitle, "px-5 sm:px-7")}>The rules it keeps for you.</h2>
              <div className="mt-7 sm:mt-10"><RulesBento /></div>
            </section>

            <WelcomeFaq items={faq} className={cn(panel, "scroll-mt-24 px-5 py-9 sm:p-10 lg:px-12 lg:py-12")} titleClassName={sectionTitle} />
          </div>
        </Suspense>
      </main>

      <Suspense>
        <WelcomeFooter className={panel} />
      </Suspense>
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

/**
 * An icon set into the headline, at the type's cap height and in its colour,
 * so the line reads as one piece of lettering. It pops in just after its line
 * has risen. Decorative: the heading's text is the words.
 */
function HeadlineGlyph({ icon: Icon, order }: { icon: ComponentType<LucideProps>; order: number }) {
  return <span aria-hidden="true" className="hero-glyph" style={{ "--glyph-order": order } as CSSProperties}><Icon strokeWidth={2.6} /></span>;
}

/**
 * One screenshot, captured once per colour theme and mode (`captureName` in
 * `src/lib/accent.ts`); the generated `.welcome-shot` rules (`ACCENT_CSS`)
 * show only the one matching `<html data-accent>` and `.dark`. Each is a
 * `<picture>`, AVIF first and the webp as the fallback. All are lazy: a
 * browser never fetches a lazy image that is `display: none`, so a visitor
 * downloads only the pair for their own theme and mode.
 *
 * The desktop shot also comes 720px wide (`SMALL_CAPTURE_SUFFIX`). Phones
 * always take that one, whatever their pixel ratio (it is still about 2x at
 * the ~350px it shows there); wider screens pick by `sizes`, which follows
 * the `.welcome-container` widths in globals.css.
 */
const DESKTOP_SHOT_SIZES = "(min-width: 1760px) 86rem, (min-width: 1440px) 78rem, (min-width: 1152px) 72rem, calc(100vw - 2rem)";

function Screenshot({ size, width, height, alt, className }: { size: "desktop" | "mobile"; width: number; height: number; alt: string; className?: string }) {
  return <>
    {ACCENTS.flatMap((accent) => (["light", "dark"] as const).map((mode) => {
      const stem = captureName(size, accent.id, mode);
      const small = `/welcome/${stem}${SMALL_CAPTURE_SUFFIX}`;
      const both = (format: string) => `${small}.${format} ${SMALL_CAPTURE_WIDTH}w, /welcome/${stem}.${format} ${width}w`;
      return <picture key={stem}>
        {size === "desktop" ? <>
          <source media="(max-width: 639px)" type="image/avif" srcSet={`${small}.avif`} />
          <source type="image/avif" srcSet={both("avif")} sizes={DESKTOP_SHOT_SIZES} />
        </> : <source type="image/avif" srcSet={`/welcome/${stem}.avif`} />}
        <img src={`/welcome/${stem}.webp`} srcSet={size === "desktop" ? both("webp") : undefined} sizes={size === "desktop" ? DESKTOP_SHOT_SIZES : undefined} data-shot={`${accent.id}-${mode}`} width={width} height={height} alt={alt} loading="lazy" decoding="async" className={cn("welcome-shot h-auto w-full", className)} />
      </picture>;
    }))}
  </>;
}
