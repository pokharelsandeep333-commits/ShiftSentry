"use client";

import { useActionState, type ReactNode } from "react";
import Link from "next/link";
import { AlertCircle, Check } from "lucide-react";
import { acceptLegalTerms } from "@/app/actions/account";
import { emptyFormState } from "@/lib/form-state";
import { LEGAL_VERSION, MINIMUM_AGE } from "@/lib/legal";
import { Button, PendingLabel } from "@/components/ui/button";
import { legalLink } from "@/components/legal-page";

/**
 * One confirmation as a row of a grouped list. The native checkbox stays in
 * the page (required, focusable, announced) but is drawn by the square beside
 * it, and the whole row is its label, so a tap anywhere ticks it. The row
 * takes the accent wash once ticked.
 */
function Confirmation({ name, disabled, children }: { name: string; disabled: boolean; children: ReactNode }) {
  return <label className="group flex cursor-pointer items-start gap-3.5 px-4 py-4 text-sm leading-6 transition-colors first:rounded-t-[0.7rem] last:rounded-b-[0.7rem] hover:bg-[var(--surface-subtle)] has-[:checked]:bg-[color-mix(in_srgb,var(--primary)_6%,transparent)] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 sm:px-5">
    <span className="relative mt-0.5 grid size-5 shrink-0 place-items-center">
      <input type="checkbox" name={name} required disabled={disabled} className="peer absolute inset-0 size-full cursor-pointer appearance-none rounded-[0.35rem] border border-[color-mix(in_srgb,var(--foreground)_28%,var(--border))] bg-[var(--card)] transition-colors checked:border-[var(--primary)] checked:bg-[var(--primary)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--primary)] disabled:cursor-not-allowed" />
      <Check aria-hidden="true" className="pointer-events-none relative size-3.5 text-[var(--primary-foreground)] opacity-0 transition-opacity peer-checked:opacity-100" strokeWidth={3} />
    </span>
    <span className="min-w-0">{children}</span>
  </label>;
}

export function AcceptanceForm({ next, demo = false }: { next: string; demo?: boolean }) {
  const [state, action, pending] = useActionState(acceptLegalTerms, emptyFormState);
  const disabled = demo || pending;
  return <form action={action} className="grid gap-5" aria-busy={pending}>
    <input type="hidden" name="version" value={LEGAL_VERSION} />
    <input type="hidden" name="next" value={next} />
    <div className="divide-y rounded-xl border">
      <Confirmation name="agreed" disabled={disabled}>
        I agree to the <Link href={`/terms?version=${LEGAL_VERSION}`} className={legalLink} target="_blank" rel="noopener">Terms of Service</Link> and acknowledge the <Link href={`/privacy?version=${LEGAL_VERSION}`} className={legalLink} target="_blank" rel="noopener">Privacy Policy</Link>.
      </Confirmation>
      <Confirmation name="eligible" disabled={disabled}>
        I am at least {MINIMUM_AGE} years old. If I am under legal adulthood where I live, I have permission from a parent or guardian.
      </Confirmation>
    </div>
    <p className="text-[13px] leading-5 text-[var(--muted-foreground)]">These confirmations do not opt you into marketing or visitor analytics.</p>
    {state.message && <p role="alert" className="flex items-start gap-2.5 rounded-xl border border-[color-mix(in_srgb,var(--danger)_30%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_7%,var(--card))] px-4 py-3 text-sm leading-6 text-[var(--foreground)]">
      <AlertCircle className="mt-0.5 size-4 shrink-0 text-[var(--danger)]" aria-hidden="true" />
      <span>{state.message}</span>
    </p>}
    <Button type="submit" disabled={disabled} className="w-full"><PendingLabel pending={pending} label="Accept and continue" pendingLabel="Recording agreement…" /></Button>
  </form>;
}
