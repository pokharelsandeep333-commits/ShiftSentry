import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { Brand } from "@/components/brand";
import { LEGAL_CONTACT_EMAIL, legalLink } from "@/components/legal-page";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function AccountDisabledPage() {
  return <main className="grid min-h-screen place-items-center bg-[radial-gradient(circle_at_top,color-mix(in_srgb,var(--primary)_14%,transparent),transparent_32rem),var(--background)] p-4"><Card className="w-full max-w-md border-[color-mix(in_srgb,var(--danger)_22%,var(--border))]"><CardHeader><Brand className="mb-5" /><span className="mb-2 grid size-12 place-items-center rounded-2xl bg-[color-mix(in_srgb,var(--danger)_12%,transparent)]"><LockKeyhole className="size-6 text-[var(--danger)]" /></span><CardTitle className="text-xl">Your account is disabled</CardTitle><CardDescription className="mt-1.5 leading-6">If you think this is a mistake, email <a className={legalLink} href={`mailto:${LEGAL_CONTACT_EMAIL}`}>{LEGAL_CONTACT_EMAIL}</a>.</CardDescription></CardHeader><CardContent><Link href="/login" className={buttonVariants()}>Return to sign in</Link></CardContent></Card></main>;
}
