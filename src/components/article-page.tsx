import type { ReactNode } from "react";
import Link from "next/link";
import { legalLink } from "@/components/legal-page";
import { PublicPage, readingColumn } from "@/components/public-page";

/**
 * The shell for the public reading pages, `/about`, `/guides` and each guide:
 * the landing's nav and footer (`PublicPage`) around the legal pages' column
 * and type. The footer links on to every other public page, so the page needs
 * no link row of its own. Public and session-free, like the legal pages.
 */
export function ArticlePage({ title, lede, children, cta = true }: { title: string; lede: string; children: ReactNode; cta?: boolean }) {
  return <PublicPage>
    <article className={readingColumn}>
      <h1 className="font-display text-3xl font-semibold tracking-tight [text-wrap:balance] sm:text-4xl">{title}</h1>
      <p className="mt-4 text-lg leading-8 text-[var(--muted-foreground)]">{lede}</p>
      {children}
      {cta && <p className="mt-12 rounded-2xl bg-[var(--primary-soft)] p-5 leading-7">
        ShiftSentry is free. Add your jobs and your hour limit, and it does the counting. {/* A deeper violet: the brand violet reads 3.9:1 on this tint. */}<Link href="/login?mode=signup" className={`${legalLink} !text-[color-mix(in_srgb,var(--primary)_78%,var(--foreground))]`}>Get started</Link>
      </p>}
    </article>
  </PublicPage>;
}

export function ArticleSection({ heading, children }: { heading: string; children: ReactNode }) {
  return <section className="mt-10 space-y-4 leading-7">
    <h2 className="font-display text-xl font-semibold">{heading}</h2>
    {children}
  </section>;
}
