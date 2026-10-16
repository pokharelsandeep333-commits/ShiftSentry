"use client";

import { useActionState, useEffect, useState } from "react";
import { Info, TriangleAlert } from "lucide-react";
import { clearAnnouncement, postAnnouncement } from "@/app/actions/admin";
import { ConfirmSubmit } from "@/components/ui/confirm-submit";
import { SubmitButton } from "@/components/ui/submit-button";
import { useToast } from "@/components/ui/toast-provider";
import { emptySavedFormState } from "@/lib/form-state";
import { cn } from "@/lib/utils";

const LIMIT = 280;

/**
 * The message, tone and preview. Keyed by the last successful post, so a
 * success remounts it empty instead of an effect clearing the fields.
 */
function ComposeFields() {
  const [message, setMessage] = useState("");
  const [tone, setTone] = useState<"info" | "warning">("info");
  const warning = tone === "warning";
  const Icon = warning ? TriangleAlert : Info;

  return <>
    <label className="field-label">
      <span>Message</span>
      <textarea name="message" required maxLength={LIMIT} rows={3} value={message} onChange={(event) => setMessage(event.target.value)} placeholder="e.g. ShiftSentry will be down for maintenance tonight from 10 to 11 PM Central." className="field-textarea text-sm" />
      <small className={cn("block text-right text-xs font-normal", message.length > LIMIT - 20 ? "text-[var(--warning)]" : "text-[var(--muted-foreground)]")}>{message.length} / {LIMIT}</small>
    </label>

    <div role="radiogroup" aria-label="Tone" className="flex flex-wrap gap-2">
      {(["info", "warning"] as const).map((value) => <label key={value} className={cn("press flex min-h-10 cursor-pointer items-center gap-2 rounded-xl border px-3.5 text-sm font-semibold has-[:focus-visible]:ring-4 has-[:focus-visible]:ring-[var(--primary-soft)]", tone === value ? "border-[var(--primary)] bg-[var(--primary-soft)] text-[var(--primary)]" : "text-[var(--muted-foreground)] hover:bg-[var(--surface-subtle)]")}>
        <input type="radio" name="tone" value={value} checked={tone === value} onChange={() => setTone(value)} className="sr-only" />
        {value === "info" ? <Info className="size-4" aria-hidden="true" /> : <TriangleAlert className="size-4" aria-hidden="true" />}
        {value === "info" ? "Information" : "Warning"}
      </label>)}
    </div>

    <div aria-hidden="true" className="grid gap-1.5">
      <p className="text-xs font-semibold text-[var(--muted-foreground)]">Preview</p>
      <div className={cn("flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm leading-6", warning ? "border-[color-mix(in_srgb,var(--warning)_45%,var(--border))] bg-[color-mix(in_srgb,var(--warning)_12%,var(--card))]" : "border-[color-mix(in_srgb,var(--primary)_30%,var(--border))] bg-[var(--primary-soft)]")}>
        <Icon className={cn("mt-1 size-4 shrink-0", warning ? "text-[var(--warning)]" : "text-[var(--primary)]")} />
        <p className="min-w-0 flex-1 whitespace-pre-line break-words">{message.trim() || <span className="text-[var(--muted-foreground)]">Your message appears here.</span>}</p>
      </div>
    </div>
  </>;
}

/** Compose and post the banner, with a preview drawn exactly as users will see it. */
export function AnnouncementForm({ hasLive }: { hasLive: boolean }) {
  const [state, action] = useActionState(postAnnouncement, emptySavedFormState);
  const { toast } = useToast();
  useEffect(() => {
    if (state.savedAt) toast("Announcement posted");
  }, [state.savedAt, toast]);

  return <form action={action} className="grid gap-4">
    <ComposeFields key={state.savedAt ?? "new"} />
    {state.message && <p role="alert" className="text-sm font-medium text-[var(--danger)]">{state.message}</p>}
    <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-4">
      <p className="text-xs text-[var(--muted-foreground)]">{hasLive ? "Posting replaces the current announcement." : "Shown to every signed-in user until you clear it. Each person can dismiss it."}</p>
      <SubmitButton label="Post announcement" pendingLabel="Posting…" />
    </div>
  </form>;
}

export function ClearAnnouncement() {
  const [state, action] = useActionState(clearAnnouncement, emptySavedFormState);
  const { toast } = useToast();
  useEffect(() => {
    if (state.savedAt) toast("Announcement cleared");
  }, [state.savedAt, toast]);
  return <form action={action} className="grid justify-items-end gap-1">
    <ConfirmSubmit label="Clear" confirmLabel="Clear the announcement?" confirmActionLabel="Clear" detail="It stops showing for everyone on their next page load." variant="outline" />
    {state.message && <p role="alert" className="text-xs text-[var(--danger)]">{state.message}</p>}
  </form>;
}
