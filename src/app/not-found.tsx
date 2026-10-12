import Link from "next/link";
import { Brand } from "@/components/brand";
import { buttonVariants } from "@/components/ui/button";

export const metadata = { title: "Page not found | ShiftSentry", description: "This ShiftSentry page could not be found.", robots: { index: false, follow: false } };

export default function NotFound() {
  return <main className="grid min-h-dvh place-items-center bg-[var(--background)] px-4 py-12"><div className="max-w-lg space-y-6"><Brand /><p className="font-display text-6xl font-semibold text-[var(--primary)]">404</p><h1 className="font-display text-3xl font-semibold">This page isn&apos;t here</h1><p className="text-sm leading-6 text-[var(--muted-foreground)]">The link may be out of date. Return to ShiftSentry or sign in to your workspace.</p><div className="flex flex-wrap gap-3"><Link href="/" className={buttonVariants()}>Return home</Link><Link href="/login" className={buttonVariants({ variant: "outline" })}>Sign in</Link></div></div></main>;
}
