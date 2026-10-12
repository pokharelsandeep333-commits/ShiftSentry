"use client";

import Link from "next/link";
import { Brand } from "./brand";
import { Button, buttonVariants } from "./ui/button";
import { LEGAL_CONTACT_EMAIL } from "./legal-page";

export function ErrorRecovery({ retry, digest }: { retry: () => void; digest?: string }) {
  return <main className="grid min-h-dvh place-items-center bg-[var(--background)] px-4 py-12"><div className="max-w-lg space-y-6"><Brand /><h1 className="font-display text-3xl font-semibold">We couldn&apos;t load this page</h1><p role="alert" className="text-sm leading-6 text-[var(--muted-foreground)]">Please try again. If the problem continues, contact support. Your changes may not have been saved.</p>{digest && <p className="break-all text-xs text-[var(--muted-foreground)]">Support reference: {digest}</p>}<div className="flex flex-wrap gap-3"><Button onClick={retry}>Try again</Button><Link href="/" className={buttonVariants({ variant: "outline" })}>Return home</Link><a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className={buttonVariants({ variant: "ghost" })}>Contact support</a></div></div></main>;
}
