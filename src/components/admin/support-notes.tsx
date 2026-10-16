"use client";

import { useActionState, useEffect, useRef } from "react";
import { addSupportNote, deleteSupportNote } from "@/app/actions/admin";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { SubmitButton } from "@/components/ui/submit-button";
import { useToast } from "@/components/ui/toast-provider";
import { emptySavedFormState } from "@/lib/form-state";

export type SupportNote = { id: string; body: string; author: string | null; createdAt: string };

function DeleteNote({ noteId }: { noteId: string }) {
  const [state, action] = useActionState(deleteSupportNote, emptySavedFormState);
  return <form action={action} className="shrink-0">
    <input type="hidden" name="noteId" value={noteId} />
    <ConfirmSubmit label="Delete" confirmLabel="Delete this note?" detail="It is removed for every admin, and from the account's data download." />
    {state.message && <p role="alert" className="mt-1 text-xs text-[var(--danger)]">{state.message}</p>}
  </form>;
}

/**
 * Admin-only notes on an account, newest first. Personal data about the
 * account holder: it is in their data download (without who wrote it) and is
 * deleted with the account, which the hint under the box says before anything
 * is written.
 */
export function SupportNotes({ userId, notes }: { userId: string; notes: SupportNote[] }) {
  const [state, action] = useActionState(addSupportNote, emptySavedFormState);
  const form = useRef<HTMLFormElement>(null);
  const { toast } = useToast();
  useEffect(() => {
    if (!state.savedAt) return;
    form.current?.reset();
    toast("Note added");
  }, [state.savedAt, toast]);

  return <div className="grid gap-4">
    <form ref={form} action={action} className="grid gap-2">
      <input type="hidden" name="userId" value={userId} />
      <label className="field-label">
        <span className="sr-only">New note</span>
        <textarea name="body" required maxLength={2000} rows={3} placeholder="What should the next admin know? e.g. emailed on 10/16 about a missing shift." className="field-textarea text-sm" />
      </label>
      <p className="text-xs leading-5 text-[var(--muted-foreground)]">Only admins see notes here, but the account holder gets them in their data download, and they are deleted with the account. Write facts, not opinions.</p>
      {state.message && <p role="alert" className="text-sm font-medium text-[var(--danger)]">{state.message}</p>}
      <div className="flex justify-end"><SubmitButton label="Add note" pendingLabel="Adding…" size="sm" /></div>
    </form>

    {notes.length ? <ol className="grid gap-2 border-t pt-4">
      {notes.map((note) => <li key={note.id} className="flex min-w-0 items-start gap-3 rounded-xl bg-[var(--surface-subtle)] px-3.5 py-3">
        <div className="min-w-0 flex-1">
          <p className="whitespace-pre-wrap break-words text-sm">{note.body}</p>
          <p className="mt-1.5 text-xs text-[var(--muted-foreground)]">{note.author ?? "A former admin"} · {note.createdAt}</p>
        </div>
        <DeleteNote noteId={note.id} />
      </li>)}
    </ol> : <p className="border-t pt-4 text-sm text-[var(--muted-foreground)]">No notes yet.</p>}
  </div>;
}
