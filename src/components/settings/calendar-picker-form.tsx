"use client";

import { useActionState } from "react";
import { saveCalendarSelection } from "@/app/actions/calendar";
import { Button, PendingLabel } from "@/components/ui/button";
import { emptySavedFormState } from "@/lib/form-state";
import type { GoogleCalendarListEntry } from "@/lib/google/client";

export function CalendarPickerForm({ calendars, selected }: { calendars: GoogleCalendarListEntry[]; selected: string[] }) {
  const [state, formAction, pending] = useActionState(saveCalendarSelection, emptySavedFormState);
  const isSelected = (calendar: GoogleCalendarListEntry) => selected.includes(calendar.id) || (calendar.primary && selected.includes("primary"));

  return <form action={formAction} className="grid gap-4">
    <fieldset className="grid gap-2">
      <legend className="mb-1 text-sm font-semibold">Calendars ShiftSentry reads</legend>
      <p className="mb-1 text-xs leading-5 text-[var(--muted-foreground)]">Events from the ticked calendars appear on your Calendar page and are checked for clashes.</p>
      {calendars.map((calendar) => <label key={calendar.id} className="flex min-h-11 items-center gap-3 rounded-xl px-2 text-sm hover:bg-[var(--surface-subtle)]">
        <input type="checkbox" name="calendarId" value={calendar.id} defaultChecked={isSelected(calendar)} className="size-4 accent-[var(--primary)]" />
        <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: calendar.color }} />
        <span className="min-w-0 truncate">{calendar.summary}{calendar.primary ? " (primary)" : ""}</span>
      </label>)}
    </fieldset>
    {state.message && <p role="alert" className="text-sm font-medium text-[var(--danger)]">{state.message}</p>}
    {state.savedAt && !state.message && <p role="status" className="text-sm text-[var(--success)]">Saved.</p>}
    <div><Button type="submit" variant="outline" disabled={pending}><PendingLabel pending={pending} label="Save calendars" pendingLabel="Saving…" /></Button></div>
  </form>;
}
