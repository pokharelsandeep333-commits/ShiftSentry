"use client";

import { useActionState, useEffect } from "react";
import { sendPasswordReset, setAccountDisabled, signOutEverywhere } from "@/app/actions/admin";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { SubmitButton } from "@/components/ui/submit-button";
import { useToast } from "@/components/ui/toast-provider";
import { emptySavedFormState, type SavedFormState } from "@/lib/form-state";

function useConfirmation(state: SavedFormState, message: string) {
  const { toast } = useToast();
  useEffect(() => {
    if (state.savedAt) toast(message);
  }, [state.savedAt, message, toast]);
}

function Problem({ state }: { state: SavedFormState }) {
  if (!state.message) return null;
  return <p role="alert" className="rounded-xl border border-[color-mix(in_srgb,var(--danger)_35%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2.5 text-sm font-medium text-[var(--danger)]">{state.message}</p>;
}

/**
 * The actions an admin can take on one account, each a form that reports back
 * in place. Disabling asks first: it blocks sign-in and every write until an
 * admin undoes it. Enabling and a password reset (rate limited, and only an
 * email) do not.
 */
export function AccountActions({ userId, email, disabled, isSelf, canResetPassword }: { userId: string; email: string; disabled: boolean; isSelf: boolean; canResetPassword: boolean }) {
  const [statusState, statusAction] = useActionState(setAccountDisabled, emptySavedFormState);
  const [resetState, resetAction] = useActionState(sendPasswordReset, emptySavedFormState);
  useConfirmation(statusState, disabled ? "Account disabled" : "Account enabled");
  useConfirmation(resetState, "Password reset email sent");
  const [sessionsState, sessionsAction] = useActionState(signOutEverywhere, emptySavedFormState);
  useConfirmation(sessionsState, "Signed out everywhere");

  return <div className="grid gap-4">
    <div className="grid gap-2 rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1 basis-56">
          <p className="text-sm font-semibold">{disabled ? "Enable this account" : "Disable this account"}</p>
          <p className="text-xs leading-5 text-[var(--muted-foreground)]">{disabled
            ? "Lets them sign in and use their workspace again."
            : "Blocks sign-in and every write straight away, including from sessions already open. Their data is kept."}</p>
        </div>
        {isSelf
          ? <p className="text-xs text-[var(--muted-foreground)]">You can&apos;t disable your own account.</p>
          : <form action={statusAction}>
              <input type="hidden" name="userId" value={userId} />
              <input type="hidden" name="disabled" value={String(!disabled)} />
              {disabled
                ? <SubmitButton label="Enable account" pendingLabel="Enabling…" size="sm" />
                : <ConfirmSubmit label="Disable account" confirmLabel={`Disable ${email}?`} confirmActionLabel="Disable" detail="They can't sign in or change anything until an admin enables the account again." variant="outline" />}
            </form>}
      </div>
      <Problem state={statusState} />
    </div>

    {!isSelf && <div className="grid gap-2 rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1 basis-56">
          <p className="text-sm font-semibold">Sign out everywhere</p>
          <p className="text-xs leading-5 text-[var(--muted-foreground)]">Ends every session, for example after a lost phone. They can sign straight back in. A page already open keeps working for up to an hour; disable the account to stop that at once.</p>
        </div>
        <form action={sessionsAction}>
          <input type="hidden" name="userId" value={userId} />
          <ConfirmSubmit label="Sign out everywhere" confirmLabel={`Sign ${email} out everywhere?`} confirmActionLabel="Sign out" detail="Every device they are signed in on has to sign in again." variant="outline" />
        </form>
      </div>
      <Problem state={sessionsState} />
    </div>}

    {canResetPassword && <div className="grid gap-2 rounded-xl border p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1 basis-56">
          <p className="text-sm font-semibold">Send a password reset</p>
          <p className="text-xs leading-5 text-[var(--muted-foreground)]">Emails them a link to choose a new password. At most 3 in 15 minutes.</p>
        </div>
        <form action={resetAction}>
          <input type="hidden" name="userId" value={userId} />
          <SubmitButton label="Send reset email" pendingLabel="Sending…" variant="outline" size="sm" />
        </form>
      </div>
      <Problem state={resetState} />
    </div>}
  </div>;
}
