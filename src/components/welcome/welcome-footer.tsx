import type { ReactNode } from "react";
import Link from "next/link";
import { Mail } from "lucide-react";
import { Brand } from "@/components/brand";
import { SignInLink } from "@/components/welcome/sign-in-link";
import { LEGAL_CONTACT_EMAIL } from "@/lib/contact";
import { GUIDES } from "@/lib/guides";
import { cn } from "@/lib/utils";

/**
 * The landing's footer: brand, tagline and the maker's links on the left,
 * four link columns on the right, and the copyright under a hairline. Plain
 * links only, so no CSP change: the LinkedIn and GitHub marks are inline SVG,
 * since lucide no longer ships brand icons, and the portfolio link wears
 * Sandeep's own "SP." monogram, redrawn from that site's favicon in the same
 * line weight as the other icons, keeping its gold dot.
 */
const PORTFOLIO_URL = "https://portfolio.sandeeppokharel.com.np";

const SOCIAL_LINKS: { label: string; href: string; icon: ReactNode; external: boolean }[] = [
  { label: `Email ${LEGAL_CONTACT_EMAIL}`, href: `mailto:${LEGAL_CONTACT_EMAIL}`, icon: <Mail className="size-[18px]" strokeWidth={1.9} />, external: false },
  { label: "Sandeep Pokharel on LinkedIn", href: "https://www.linkedin.com/in/sandeeppokharel333", icon: <LinkedInMark />, external: true },
  { label: "Sandeep Pokharel on GitHub", href: "https://github.com/pokharelsandeep333-commits", icon: <GitHubMark />, external: true },
  { label: "Sandeep Pokharel's portfolio", href: PORTFOLIO_URL, icon: <MonogramMark />, external: true },
];

/* `py-1` lifts each link past the 24px minimum touch target without spreading the columns. */
const footerLink = "inline-flex min-h-11 items-center py-1 text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--primary)] sm:min-h-0";

/* `base` as in `WelcomeNav`: "/" off the landing, so the section links reach it. */
export function WelcomeFooter({ className, base = "" }: { className: string; base?: "" | "/" }) {
  return <footer className="px-3 pb-3 pt-4 sm:px-6 sm:pb-6 sm:pt-5">
    <div className={cn(className, "px-6 sm:px-10 lg:px-12")}>
      <div className="grid gap-10 pb-10 pt-11 sm:pt-12 lg:grid-cols-12 lg:gap-8">
        <div className="lg:col-span-4">
          <Brand size="compact" markClassName="size-8 rounded-lg" className="gap-2.5 text-[15px]" />
          <p className="mt-4 max-w-[20rem] text-sm leading-6 text-[var(--muted-foreground)]">A work hours tracker for students and anyone with more than one job.</p>
          <ul className="mt-6 flex items-center gap-2">
            {SOCIAL_LINKS.map(({ label, href, icon, external }) => <li key={href}>
              <a href={href} aria-label={label} title={label} {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})} className="footer-social grid size-11 place-items-center rounded-full border text-[var(--muted-foreground)] transition-[color,background-color,border-color,translate] duration-200 ease-out hover:-translate-y-0.5 hover:text-[var(--primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] sm:size-10">
                {icon}
              </a>
            </li>)}
          </ul>
        </div>

        <nav aria-label="Footer" className="grid grid-cols-2 gap-x-6 gap-y-9 sm:grid-cols-[1fr_1.4fr_0.9fr_1.1fr] lg:col-span-8">
          <FooterColumn title="Product">
            <li><a href={`${base}#how`} className={footerLink}>How it works</a></li>
            <li><a href={`${base}#week`} className={footerLink}>Example week</a></li>
            <li><a href={`${base}#faq`} className={footerLink}>Questions</a></li>
            <li><Link href="/about" className={footerLink}>About</Link></li>
          </FooterColumn>
          <FooterColumn title="Guides">
            {GUIDES.map((guide) => <li key={guide.slug}><Link href={`/guides/${guide.slug}`} className={footerLink}>{guide.navLabel}</Link></li>)}
            <li><Link href="/guides" className={footerLink}>All guides</Link></li>
          </FooterColumn>
          <FooterColumn title="Account">
            <li><SignInLink href="/login" className={footerLink}>Sign in</SignInLink></li>
            <li><SignInLink href="/login?mode=signup" className={footerLink}>Get started</SignInLink></li>
          </FooterColumn>
          <FooterColumn title="Legal">
            <li><Link href="/privacy" className={footerLink}>Privacy Policy</Link></li>
            <li><Link href="/terms" className={footerLink}>Terms of Service</Link></li>
            <li><Link href="/cookies" className={footerLink}>Cookies and storage</Link></li>
            <li><Link href="/open-source-licenses" className={footerLink}>Open-source licenses</Link></li>
            <li><a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className={footerLink}>Contact</a></li>
          </FooterColumn>
        </nav>
      </div>

      <p className="border-t py-6 text-[13px] text-[var(--muted-foreground)]">© 2026 ShiftSentry</p>
    </div>
  </footer>;
}

/* The column titles are labels, not headings: as `<h2>`s they sat beside the
   page's real section headings in the outline. */
function FooterColumn({ title, children }: { title: string; children: ReactNode }) {
  return <div>
    <p className="text-[13px] font-semibold">{title}</p>
    <ul className="mt-3.5 space-y-2.5 text-sm">{children}</ul>
  </div>;
}

function LinkedInMark() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[17px]" fill="currentColor">
    <path d="M20.45 20.45h-3.56v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28ZM5.34 7.43a2.06 2.06 0 1 1 0-4.13 2.06 2.06 0 0 1 0 4.13ZM7.12 20.45H3.56V9h3.56v11.45ZM22.23 0H1.77C.79 0 0 .77 0 1.73v20.54C0 23.23.79 24 1.77 24h20.45c.98 0 1.78-.77 1.78-1.73V1.73C24 .77 23.2 0 22.22 0Z" />
  </svg>;
}

function GitHubMark() {
  return <svg viewBox="0 0 24 24" aria-hidden="true" className="size-[18px]" fill="currentColor">
    <path d="M12 .3a12 12 0 0 0-3.8 23.38c.6.12.83-.26.83-.57l-.02-2.04c-3.34.72-4.04-1.61-4.04-1.61-.55-1.39-1.33-1.76-1.33-1.76-1.09-.74.08-.73.08-.73 1.2.09 1.84 1.24 1.84 1.24 1.07 1.83 2.81 1.3 3.5 1 .1-.78.42-1.31.76-1.61-2.67-.3-5.47-1.33-5.47-5.93 0-1.31.47-2.38 1.24-3.22-.14-.3-.54-1.52.1-3.18 0 0 1-.32 3.3 1.23a11.5 11.5 0 0 1 6 0c2.28-1.55 3.29-1.23 3.29-1.23.64 1.66.24 2.88.12 3.18a4.65 4.65 0 0 1 1.23 3.22c0 4.61-2.8 5.63-5.48 5.92.43.37.82 1.1.82 2.22l-.01 3.29c0 .31.2.69.82.57A12 12 0 0 0 12 .3Z" />
  </svg>;
}

/* The portfolio favicon's "SP." monogram, cropped to the letters: strokes in
   the icon colour, the dot in its gold. */
function MonogramMark() {
  return <svg viewBox="44 145 426 220" aria-hidden="true" className="h-[13px] w-[25px]" fill="none" stroke="currentColor" strokeWidth={52} strokeLinecap="round" strokeLinejoin="round">
    <path d="M214 175H114a40 40 0 0 0 0 80h60a40 40 0 0 1 0 80H74" />
    <path d="M264 335V175h70a50 50 0 0 1 0 100h-70" />
    <circle cx="439" cy="320" r="26" fill="#FFC72C" stroke="none" />
  </svg>;
}
