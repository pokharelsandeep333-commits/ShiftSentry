import type { ReactNode } from "react";
import Link from "next/link";
import { Brand } from "@/components/brand";

/**
 * The shell shared by /privacy and /terms. Both are public, static, and linked
 * from Google's consent-screen Branding, so neither may need a session.
 */
export const LEGAL_CONTACT_EMAIL = "pokharelsandeep333@gmail.com";

export const legalLink = "font-semibold text-[var(--primary)] underline underline-offset-4";

export function LegalPage({ title, effective, children }: { title: string; effective: string; children: ReactNode }) {
  return <main className="min-h-dvh bg-[var(--background)] px-4 py-10 sm:px-8 sm:py-14">
    <article className="mx-auto max-w-2xl">
      <Link href="/login" className="inline-block"><Brand /></Link>
      <h1 className="mt-10 font-display text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
      <p className="mt-3 text-sm text-[var(--muted-foreground)]">Effective {effective}</p>
      {children}
      <p className="mt-12 flex flex-wrap gap-x-5 gap-y-2 text-sm">
        <Link href="/login" className="font-semibold text-[var(--primary)] transition-opacity hover:opacity-75">Back to ShiftSentry</Link>
        <Link href="/privacy" className="text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]">Privacy Policy</Link>
        <Link href="/terms" className="text-[var(--muted-foreground)] transition-colors hover:text-[var(--foreground)]">Terms of Service</Link>
      </p>
    </article>
  </main>;
}

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return <section className="mt-10 space-y-4 leading-7">
    <h2 className="font-display text-xl font-semibold">{title}</h2>
    {children}
  </section>;
}
