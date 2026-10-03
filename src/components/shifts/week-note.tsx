"use client";

import { useActionState, useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { NotebookPen } from "lucide-react";
import { saveWeekNote } from "@/app/actions/work";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast-provider";
import { emptySavedFormState, type SavedFormState } from "@/lib/form-state";
import { WEEK_NOTE_MAX, type WeekNoteMatch } from "@/lib/week-notes";

/**
 * One week's note in the shift log: the text (or "Add a note") until clicked,
 * then a textarea with Save and Cancel. Saving an empty note removes it.
 *
 * The action answers with state rather than redirecting, so the week stays
 * open where the viewer was writing. The editor closes from inside the action
 * callback -- not from an effect watching the result -- and focus goes back to
 * the button that opened it, so a keyboard user is not dropped at the top.
 */
export function WeekNote({ weekStart, label, note }: { weekStart: string; label: string; note: WeekNoteMatch | null }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(note?.body ?? "");
  const textareaId = useId();
  const textarea = useRef<HTMLTextAreaElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const returnFocus = useRef(false);

  const [state, formAction, pending] = useActionState(async (previous: SavedFormState, formData: FormData) => {
    const result = await saveWeekNote(previous, formData);
    if (result.savedAt && !result.message) {
      toast(String(formData.get("body") ?? "").trim() ? "Note saved" : "Note removed");
      returnFocus.current = true;
      setEditing(false);
    }
    return result;
  }, emptySavedFormState);

  useEffect(() => {
    if (editing) {
      const field = textarea.current;
      field?.focus();
      field?.setSelectionRange(field.value.length, field.value.length);
    } else if (returnFocus.current) {
      returnFocus.current = false;
      trigger.current?.focus();
    }
  }, [editing]);

  function open() {
    setDraft(note?.body ?? "");
    setEditing(true);
  }

  function cancel() {
    returnFocus.current = true;
    setEditing(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Escape") { event.preventDefault(); cancel(); }
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); }
  }

  if (!editing) {
    return note
      ? <div className="flex items-start gap-2.5 rounded-2xl bg-[var(--surface-subtle)] px-3.5 py-3 sm:px-4">
        <NotebookPen aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-[var(--primary)]" />
        <p className="min-w-0 flex-1 whitespace-pre-wrap break-words text-sm leading-6"><span className="sr-only">Note for {label}: </span>{note.body}</p>
        <Button ref={trigger} type="button" variant="ghost" size="sm" className="-my-1 shrink-0" onClick={open} aria-label={`Edit the note for ${label}`}>Edit</Button>
      </div>
      : <Button ref={trigger} type="button" variant="ghost" size="sm" className="text-[var(--muted-foreground)]" onClick={open} aria-label={`Add a note for ${label}`}><NotebookPen aria-hidden="true" className="size-4" />Add a note</Button>;
  }

  const over = draft.length > WEEK_NOTE_MAX;
  return <form action={formAction} className="space-y-2 rounded-2xl bg-[var(--surface-subtle)] p-3 sm:p-3.5">
    <input type="hidden" name="weekStart" value={weekStart} />
    {note?.legacy && <input type="hidden" name="legacyId" value={note.id} />}
    <label htmlFor={textareaId} className="sr-only">Note for {label}</label>
    <textarea ref={textarea} id={textareaId} name="body" value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={onKeyDown} maxLength={WEEK_NOTE_MAX} rows={3} placeholder="Anything to remember about this week: time off asked for, a short paycheck, a swap…" className="field-textarea min-h-[5.5rem] resize-y text-sm" />
    <div className="flex flex-wrap items-center gap-2">
      <span className={over ? "text-xs font-semibold tabular-nums text-[var(--danger)]" : "text-xs tabular-nums text-[var(--muted-foreground)]"}>{draft.length.toLocaleString("en-US")} / {WEEK_NOTE_MAX.toLocaleString("en-US")}</span>
      <span className="hidden text-xs text-[var(--muted-foreground)] sm:inline">· Ctrl+Enter to save, Esc to cancel</span>
      <div className="ml-auto flex items-center gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={cancel} disabled={pending}>Cancel</Button>
        <Button type="submit" size="sm" disabled={pending || over || (!note && !draft.trim())}>{pending ? "Saving…" : draft.trim() || !note ? "Save" : "Remove note"}</Button>
      </div>
    </div>
    {state.message && <p role="alert" className="text-sm font-medium text-[var(--danger)]">{state.message}</p>}
  </form>;
}
