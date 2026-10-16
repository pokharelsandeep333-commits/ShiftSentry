"use client";

import { useId, useState, type ReactNode } from "react";
import { Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * The host's setup card: the saved rules as chips, and the settings form behind
 * Edit setup. Closing hides the form rather than unmounting it, so a half-made
 * change survives a close and reopen (and the live re-renders in between): the
 * form keeps its unsaved edits in its own state, which an unmount would drop.
 */
export function SetupEditor({ summary, children }: { summary: ReactNode; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const panelId = useId();

  return <div className="grid gap-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-0 flex-1 basis-60">{summary}</div>
      <Button type="button" variant={open ? "ghost" : "outline"} size="sm" aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((value) => !value)}>
        {open ? <X className="size-3.5" /> : <Pencil className="size-3.5" />}
        {open ? "Close" : "Edit setup"}
      </Button>
    </div>
    <div id={panelId} hidden={!open} className="border-t pt-5">{children}</div>
  </div>;
}
