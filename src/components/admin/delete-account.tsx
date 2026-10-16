"use client";

import { useActionState, useState } from "react";
import { deleteAccountAsAdmin } from "@/app/actions/admin";
import { signOut } from "@/app/actions/auth";
import { Button, PendingLabel } from "@/components/ui/button";
import { emptySavedFormState } from "@/lib/form-state";

/**
 * Deleting an account on its holder's request. Typing the email is the
 * confirmation, so there is no second dialog: the button stays off until the
 * text matches. The server checks the same things again, plus a sign-in within
 * the last 10 minutes; when that fails, signing out is offered right here.
 *
 * `finishing` is for an account already locked by a deletion that did not
 * complete: the same sequence, run again, finishes it.
 */
export function DeleteAccount({ userId, email, finishing }: { userId: string; email: string; finishing: boolean }) {
  const [state, action, pending] = useActionState(deleteAccountAsAdmin, emptySavedFormState);
  const [typed, setTyped] = useState("");
  const matches = typed.trim().toLowerCase() === email.toLowerCase();
  const needsFreshSignIn = state.message.toLowerCase().includes("sign in again");

  return <div className="grid gap-3">
    <p className="text-sm leading-6 text-[var(--muted-foreground)]">
      {finishing
        ? "This account's deletion started but didn't finish, so it is locked. Run it again to finish."
        : "Permanently deletes the account and everything in it, including rooms they host. Do this only for a deletion request you have verified (docs/privacy-operations.md). It can't be undone."}
    </p>
    <form action={action} className="grid gap-3">
      <input type="hidden" name="userId" value={userId} />
      <label className="field-label">
        <span>Type <span className="font-mono">{email}</span> to confirm</span>
        <input name="confirmEmail" value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" spellCheck={false} className="field-control" />
      </label>
      {state.message && <p role="alert" className="rounded-xl border border-[color-mix(in_srgb,var(--danger)_35%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2.5 text-sm font-medium text-[var(--danger)]">{state.message}</p>}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-[var(--muted-foreground)]">Requires a sign-in within the last 10 minutes.</p>
        <Button type="submit" variant="danger" disabled={!matches || pending}><PendingLabel pending={pending} label={finishing ? "Finish deletion" : "Delete account"} pendingLabel="Deleting…" /></Button>
      </div>
    </form>
    {needsFreshSignIn && <form action={signOut}><Button type="submit" variant="outline" size="sm">Sign out to sign in again</Button></form>}
  </div>;
}
