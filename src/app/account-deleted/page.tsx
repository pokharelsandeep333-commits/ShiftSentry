import Link from "next/link";
import { Brand } from "@/components/brand";
import { buttonVariants } from "@/components/ui/button";

export const metadata = { title: "Account deleted | ShiftSentry", robots: { index: false, follow: false }, alternates: { canonical: "/account-deleted" } };
export default function AccountDeletedPage() {
  return <main className="grid min-h-dvh place-items-center bg-[var(--background)] px-4 py-12"><div className="max-w-lg space-y-6"><Brand /><h1 className="font-display text-3xl font-semibold">Your account has been deleted</h1><p className="text-sm leading-6 text-[var(--muted-foreground)]">Your active account and related records have been removed. Retained security details are redacted; provider backups and logs expire under their own settings.</p><Link href="/" className={buttonVariants()}>Return home</Link><Link href="/privacy" className={buttonVariants({ variant: "ghost" })}>Privacy Policy</Link></div></main>;
}
