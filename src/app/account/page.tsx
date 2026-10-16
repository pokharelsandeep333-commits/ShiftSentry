import Link from "next/link";
import { Brand } from "@/components/brand";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button, buttonVariants } from "@/components/ui/button";
import { LEGAL_CONTACT_EMAIL, legalLink } from "@/components/legal-page";
import { DeletionForm } from "@/components/account/deletion-form";
import { requireAccount } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { signOut } from "@/app/actions/auth";

export const metadata = { title: "Account and privacy | ShiftSentry", description: "Export your information, view agreements, or delete your account.", robots: { index: false, follow: false }, alternates: { canonical: "/account" } };

export default async function AccountPage() {
  const demo = !isSupabaseConfigured();
  const profile = demo ? null : await requireAccount();
  const history = demo ? null : await (await createServerSupabaseClient()).from("legal_acceptances").select("version,accepted_at").order("accepted_at", { ascending: false });
  if (history?.error) throw new Error("Agreement history is temporarily unavailable.");
  const agreements = history?.data ?? [];
  return <main className="min-h-dvh bg-[var(--background)] px-4 py-8 sm:py-12"><div className="mx-auto max-w-2xl space-y-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><Link href="/" className="inline-flex min-h-11 items-center"><Brand /></Link>{!demo && <form action={signOut}><Button variant="outline">Sign out</Button></form>}</div>
    <header><h1 className="font-display text-3xl font-semibold tracking-tight">Account and privacy</h1><p className="mt-3 break-words text-sm leading-6 text-[var(--muted-foreground)]">{profile?.email ?? "Preview mode"}. These tools do not require acceptance of updated Terms.</p></header>
    {demo && <p role="status" className="rounded-xl border p-4 text-sm">Preview only. Downloads and deletion are disabled without a configured account service.</p>}
    {profile?.deletion_pending_at && <p role="alert" className="rounded-xl border p-4 text-sm">Deletion is pending and workspace writes are locked. If signing in or retrying is unavailable, contact <a className={legalLink} href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a> to complete deletion.</p>}
    <Card id="export" className="scroll-mt-6"><CardHeader><CardTitle>Download your data</CardTitle></CardHeader><CardContent className="space-y-4"><p className="text-sm leading-6 text-[var(--muted-foreground)]">A JSON file of your profile, jobs, shifts, deductions, notes, agreements, calendar settings, and your own game contributions. Credentials and hidden game information are excluded.</p>{demo ? <Button disabled>Download account data</Button> : <a href="/account/export" className={buttonVariants()}>Download account data</a>}</CardContent></Card>
    <Card id="agreements" className="scroll-mt-6"><CardHeader><CardTitle>Agreement history</CardTitle></CardHeader><CardContent>{agreements.length ? <ul className="space-y-3">{agreements.map((agreement) => <li key={agreement.version} className="text-sm leading-6"><Link href={`/terms?version=${agreement.version}`} className={legalLink}>Terms {agreement.version}</Link><span className="mx-2">·</span><Link href={`/privacy?version=${agreement.version}`} className={legalLink}>Privacy notice</Link><p className="text-[var(--muted-foreground)]">Accepted {new Date(agreement.accepted_at).toLocaleString("en-US", { timeZone: "UTC" })} UTC</p></li>)}</ul> : <p className="text-sm text-[var(--muted-foreground)]">No agreement has been recorded yet.</p>}<Link href="/accept-terms" className={`${legalLink} mt-4 inline-flex min-h-11 items-center`}>Review current Terms</Link></CardContent></Card>
    <Card id="delete" className="scroll-mt-6 border-[color-mix(in_srgb,var(--danger)_35%,var(--border))]"><CardHeader><CardTitle>Delete your account</CardTitle><p className="mt-2 text-sm leading-6 text-[var(--muted-foreground)]">Permanent deletion also closes every room you host and removes its shared history. Minimal security audit details are redacted and follow the 30-day cleanup policy. Provider backups and logs expire separately.</p></CardHeader><CardContent><DeletionForm demo={demo} /></CardContent></Card>
    <p className="text-sm leading-6">Need access, correction, or help with deletion? <a className={legalLink} href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a></p>
    <nav aria-label="Account links" className="flex flex-wrap gap-3"><Link href="/settings#account" className={buttonVariants({ variant: "outline" })}>Back to settings</Link><Link href="/privacy" className={buttonVariants({ variant: "ghost" })}>Privacy Policy</Link><Link href="/cookies" className={buttonVariants({ variant: "ghost" })}>Cookies and storage</Link></nav>
  </div></main>;
}
