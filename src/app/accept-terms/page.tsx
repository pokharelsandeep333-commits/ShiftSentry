import Link from "next/link";
import { redirect } from "next/navigation";
import { Brand } from "@/components/brand";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { AcceptanceForm } from "@/components/account/acceptance-form";
import { requireAccount } from "@/lib/auth";
import { hasCurrentLegalAcceptance } from "@/lib/legal-server";
import { legalDestination, LEGAL_VERSION } from "@/lib/legal";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { signOut } from "@/app/actions/auth";

export const metadata = { title: "Review Terms | ShiftSentry", description: "Review the agreement and eligibility requirements before using ShiftSentry.", robots: { index: false, follow: false }, alternates: { canonical: "/accept-terms" } };

export default async function AcceptTermsPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const next = legalDestination((await searchParams).next ?? null);
  const demo = !isSupabaseConfigured();
  if (!demo) {
    const profile = await requireAccount();
    if (profile.deletion_pending_at) redirect("/account?deletion=pending");
    if (profile.disabled_at) redirect("/account-disabled");
    if (await hasCurrentLegalAcceptance()) redirect(next);
  }
  return <main className="min-h-dvh bg-[var(--background)] px-4 py-8 sm:py-12">
    <div className="mx-auto max-w-xl space-y-6"><Link href="/" className="inline-flex min-h-11 items-center"><Brand /></Link>
      <Card><CardHeader><p className="text-xs font-semibold uppercase tracking-wider text-[var(--primary)]">Agreement {LEGAL_VERSION}</p><h1 className="font-display text-3xl font-semibold tracking-tight">Before you continue</h1><p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">Please review the Terms and Privacy Policy. ShiftSentry is free, and your work records stay private.</p></CardHeader>
        <CardContent>{demo && <p role="status" className="mb-4 text-sm text-[var(--muted-foreground)]">Preview only. Agreement recording requires a configured account service.</p>}<AcceptanceForm next={next} demo={demo} /></CardContent>
      </Card>
      <p className="text-sm leading-6 text-[var(--muted-foreground)]">You can decline and still <Link className="font-semibold text-[var(--primary)] underline" href="/account">export or delete your account</Link>.</p>
      <div className="flex flex-wrap gap-3"><Link href="/account" className={buttonVariants({ variant: "outline" })}>Account tools</Link>{!demo && <form action={signOut}><Button variant="ghost">Sign out</Button></form>}</div>
    </div>
  </main>;
}
