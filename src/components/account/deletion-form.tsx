"use client";

import { useActionState } from "react";
import { deleteOwnAccount } from "@/app/actions/account";
import { emptyFormState } from "@/lib/form-state";
import { Button, PendingLabel } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function DeletionForm({ demo = false }: { demo?: boolean }) {
  const [state, action, pending] = useActionState(deleteOwnAccount, emptyFormState);
  return <form action={action} className="space-y-4" aria-busy={pending}>
    <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-xl border p-4 text-sm leading-6">
      <input name="understood" type="checkbox" required disabled={demo || pending} className="mt-1 size-5 shrink-0 accent-[var(--danger)]" />
      <span>I understand this permanently deletes my account, work records, agreement history, game contributions, and every room I host, including its shared history.</span>
    </label>
    <div><label htmlFor="delete-confirmation" className="mb-2 block text-sm font-semibold">Type DELETE to confirm</label><Input id="delete-confirmation" name="confirmation" required pattern="DELETE" autoComplete="off" disabled={demo || pending} aria-describedby="delete-help" /></div>
    <p id="delete-help" className="text-sm leading-6 text-[var(--muted-foreground)]">Sign out and sign in again if your last authentication was more than 10 minutes ago. Export your data first if you need a copy.</p>
    {state.message && <p role="alert" className="text-sm font-medium text-[var(--danger)]">{state.message}</p>}
    <Button type="submit" variant="danger" disabled={demo || pending}><PendingLabel pending={pending} label="Permanently delete account" pendingLabel="Deleting account…" /></Button>
  </form>;
}
