import type { ReactNode } from "react";
import { PublicPage, readingColumn } from "@/components/public-page";

/* Re-exported for the pages that already import it from here; see `src/lib/contact.ts`. */
export { LEGAL_CONTACT_EMAIL } from "@/lib/contact";

export const legalLink = "font-semibold text-[var(--primary)] rounded-sm focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--primary)] transition-colors hover:text-[color-mix(in_srgb,var(--primary)_72%,var(--foreground))]";

/**
 * The shell shared by /privacy, /terms and /cookies. All are public and
 * static, and /privacy and /terms are linked from Google's consent-screen
 * Branding, so none may need a session. The landing's nav and footer
 * (`PublicPage`) frame the reading column; the footer carries the links on to
 * the other legal pages.
 */
export function LegalPage({ title, effective, children }: { title: string; effective: string; children: ReactNode }) {
  return <PublicPage>
    <article className={readingColumn}>
      <h1 className="font-display text-3xl font-semibold tracking-tight [text-wrap:balance] sm:text-4xl">{title}</h1>
      <p className="mt-3 text-sm text-[var(--muted-foreground)]">Effective {effective}</p>
      {children}
    </article>
  </PublicPage>;
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="mt-10 space-y-4 leading-7">
    <h2 className="font-display text-xl font-semibold">{title}</h2>
    {children}
  </section>;
}
