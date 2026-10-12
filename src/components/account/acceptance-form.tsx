"use client";

import { useActionState } from "react";
import Link from "next/link";
import { acceptLegalTerms } from "@/app/actions/account";
import { emptyFormState } from "@/lib/form-state";
import { LEGAL_VERSION, MINIMUM_AGE } from "@/lib/legal";
import { Button, PendingLabel } from "@/components/ui/button";
import { legalLink } from "@/components/legal-page";

export function AcceptanceForm({ next, demo = false }: { next: string; demo?: boolean }) {
  const [state, action, pending] = useActionState(acceptLegalTerms, emptyFormState);
  return <form action={action} className="space-y-5" aria-busy={pending}>
    <input type="hidden" name="version" value={LEGAL_VERSION} />
    <input type="hidden" name="next" value={next} />
    <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border p-4 text-sm leading-6">
      <input type="checkbox" name="agreed" required disabled={demo || pending} className="mt-1 size-5 shrink-0 accent-[var(--primary)]" />
      <span>I agree to the <Link href={`/terms?version=${LEGAL_VERSION}`} className={legalLink} target="_blank" rel="noopener">Terms of Service</Link> and acknowledge the <Link href={`/privacy?version=${LEGAL_VERSION}`} className={legalLink} target="_blank" rel="noopener">Privacy Policy</Link>.</span>
    </label>
    <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border p-4 text-sm leading-6">
      <input type="checkbox" name="eligible" required disabled={demo || pending} className="mt-1 size-5 shrink-0 accent-[var(--primary)]" />
      <span>I am at least {MINIMUM_AGE} years old. If I am under legal adulthood where I live, I have permission from a parent or guardian.</span>
    </label>
    <p className="text-sm leading-6 text-[var(--muted-foreground)]">These confirmations do not opt you into marketing or visitor analytics.</p>
    {state.message && <p role="alert" className="text-sm font-medium text-[var(--danger)]">{state.message}</p>}
    <Button type="submit" disabled={demo || pending} className="w-full"><PendingLabel pending={pending} label="Accept and continue" pendingLabel="Recording agreement…" /></Button>
  </form>;
}
