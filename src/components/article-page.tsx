import type { ReactNode } from "react";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { legalLink } from "@/components/legal-page";
import { GUIDES } from "@/lib/guides";

const footerLink = `${legalLink} inline-flex min-h-11 items-center sm:min-h-0`;

/**
 * The shell for the public reading pages, `/about` and the guides: the legal
 * pages' column and type, with links on to the other public pages so none of
 * them is a dead end. Public and session-free, like the legal pages.
 */
export function ArticlePage({ title, lede, children, cta = true }: { title: string; lede: string; children: ReactNode; cta?: boolean }) {
  return <main className="min-h-dvh bg-[var(--background)] px-4 py-10 sm:px-8 sm:py-14">
    <article className="mx-auto max-w-2xl">
      <Link href="/" className="inline-flex min-h-11 items-center rounded-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[var(--primary)]"><Brand /></Link>
      <h1 className="mt-10 font-display text-3xl font-semibold tracking-tight [text-wrap:balance] sm:text-4xl">{title}</h1>
      <p className="mt-4 text-lg leading-8 text-[var(--muted-foreground)]">{lede}</p>
      {children}
      {cta && <p className="mt-12 rounded-2xl bg-[var(--primary-soft)] p-5 leading-7">
        ShiftSentry is free. Add your jobs and your hour limit, and it does the counting. <Link href="/login?mode=signup" className={legalLink}>Get started</Link>
      </p>}
      <nav aria-label="More from ShiftSentry" className="mt-12 border-t pt-6">
        <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
          <li><Link href="/" className={footerLink}>Home</Link></li>
          {GUIDES.map((guide) => <li key={guide.slug}><Link href={`/guides/${guide.slug}`} className={footerLink}>{guide.navLabel}</Link></li>)}
          <li><Link href="/about" className={footerLink}>About</Link></li>
          <li><Link href="/privacy" className={footerLink}>Privacy Policy</Link></li>
        </ul>
      </nav>
    </article>
  </main>;
}

export function ArticleSection({ heading, children }: { heading: string; children: ReactNode }) {
  return <section className="mt-10 space-y-4 leading-7">
    <h2 className="font-display text-xl font-semibold">{heading}</h2>
    {children}
  </section>;
}
