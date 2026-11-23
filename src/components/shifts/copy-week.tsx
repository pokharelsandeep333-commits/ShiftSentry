"use client";

import { useEffect, useId, useRef, useState, useTransition, type CSSProperties } from "react";
import { CopyPlus } from "lucide-react";
import { copyWeekToNext, previewWeekCopy } from "@/app/actions/work";
import { Button, PendingLabel } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast-provider";
import { copySkipLabel, copySummary, type CopyWeekItem } from "@/lib/copy-week";

type View =
  | { step: "loading" }
  | { step: "error"; message: string }
  | { step: "preview"; targetRange: string; items: CopyWeekItem[] }
  | { step: "done"; targetRange: string; created: number; items: CopyWeekItem[] };

/**
 * "Copy to next week" on one week of the shift log. Opening it asks the server
 * what the copy would do (nothing is written), and the dialog lists every
 * shift with where it lands or why it would be skipped. Copy then re-plans on
 * the server and writes each shift on its own, so the result can differ from
 * the preview if something changed in between; the dialog shows the result.
 */
export function CopyWeekButton({ weekStart, label }: { weekStart: string; label: string }) {
  const { toast } = useToast();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>({ step: "loading" });
  const [copying, startCopy] = useTransition();
  const [, startPreview] = useTransition();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    else if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const sync = () => setOpen(false);
    dialog.addEventListener("close", sync);
    return () => dialog.removeEventListener("close", sync);
  }, []);

  function openPreview() {
    setView({ step: "loading" });
    setOpen(true);
    startPreview(async () => {
      try {
        const result = await previewWeekCopy(weekStart);
        setView(result.status === "ok" ? { step: "preview", targetRange: result.targetRange, items: result.items } : { step: "error", message: result.message });
      } catch {
        setView({ step: "error", message: "We couldn't check next week. Please try again." });
      }
    });
  }

  function copy() {
    startCopy(async () => {
      try {
        const result = await copyWeekToNext(weekStart);
        if (result.status === "error") { setView({ step: "error", message: result.message }); return; }
        const skipped = result.items.length - result.created;
        toast(copySummary(result.created, skipped));
        // Everything landed: nothing left to read, so get out of the way.
        if (!skipped) { setOpen(false); return; }
        setView({ step: "done", targetRange: result.targetRange, created: result.created, items: result.items });
      } catch {
        setView({ step: "error", message: "We couldn't copy this week. Please try again." });
      }
    });
  }

  const copyable = view.step === "preview" ? view.items.filter((item) => !item.skip).length : 0;

  return <>
    <Button type="button" variant="outline" size="sm" onClick={openPreview} aria-label={`Copy the shifts of ${label} to next week`}>
      <CopyPlus className="size-4" aria-hidden="true" />Copy to next week
    </Button>

    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onClick={(event) => { if (event.target === dialogRef.current && !copying) setOpen(false); }}
      onCancel={(event) => { if (copying) event.preventDefault(); }}
      className="dialog-pop copy-week-dialog m-auto w-[min(26rem,calc(100vw-2rem))] rounded-2xl border border-[color-mix(in_srgb,var(--primary)_20%,var(--border))] bg-[var(--card)] p-0 text-[var(--foreground)] shadow-2xl shadow-black/25"
    >
      <div className="grid gap-4 p-5">
        <div className="grid gap-1.5">
          <p id={titleId} className="text-base font-semibold leading-6">{
            view.step === "done" ? copySummary(view.created, view.items.length - view.created)
              : view.step === "preview" ? `Copy to ${view.targetRange}?`
                : "Copy to next week"
          }</p>
          <p className="text-sm leading-6 text-[var(--muted-foreground)]" aria-live="polite">{
            view.step === "loading" ? "Checking next week…"
              : view.step === "error" ? view.message
                : view.step === "done" ? `These weren’t copied to ${view.targetRange}:`
                  : copyable ? `Same jobs and times, saved as upcoming shifts.${copyable < view.items.length ? " Shifts marked below will be skipped." : ""}`
                    : "None of these shifts can be copied."
          }</p>
        </div>

        {(view.step === "preview" || view.step === "done") && <ul className="copy-week-list" aria-label={view.step === "done" ? "Skipped shifts" : "Shifts to copy"}>
          {(view.step === "done" ? view.items.filter((item) => item.skip) : view.items).map((item, index) => <li key={index} data-skipped={item.skip ? "" : undefined} style={{ "--job": item.color } as CSSProperties}>
            <span className="copy-week-job"><i aria-hidden="true" />{item.jobName}</span>
            <span className="copy-week-time">{item.day} · {item.time}{item.endsOn ? ` (ends ${item.endsOn})` : ""}</span>
            {item.skip && <span className="copy-week-skip">{view.step === "done" ? "" : "Skipped: "}{copySkipLabel(item.skip)}</span>}
          </li>)}
        </ul>}

        <div className="flex flex-wrap justify-end gap-2">
          {view.step === "preview" && copyable > 0 ? <>
            <Button type="button" variant="ghost" size="sm" autoFocus disabled={copying} onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="button" size="sm" disabled={copying} onClick={copy}><PendingLabel pending={copying} label={`Copy ${copyable} shift${copyable === 1 ? "" : "s"}`} pendingLabel="Copying…" /></Button>
          </> : <Button type="button" variant={view.step === "done" ? "default" : "ghost"} size="sm" autoFocus onClick={() => setOpen(false)}>{view.step === "done" ? "Done" : "Close"}</Button>}
        </div>
      </div>
    </dialog>
  </>;
}
