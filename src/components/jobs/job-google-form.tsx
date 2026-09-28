"use client";

import { useActionState } from "react";
import { saveJobGoogleSettings } from "@/app/actions/calendar";
import { Button } from "@/components/ui/button";
import { PremiumSelect } from "@/components/ui/premium-select";
import { emptySavedFormState } from "@/lib/form-state";

type Props = {
  jobId: string;
  jobName: string;
  keyword: string | null;
  calendarId: string | null;
  sync: boolean;
  calendars: { id: string; summary: string; primary: boolean }[];
};

/** Which Google events are this job's, and whether they become shifts on their own. */
export function JobGoogleForm({ jobId, jobName, keyword, calendarId, sync, calendars }: Props) {
  const [state, formAction, pending] = useActionState(saveJobGoogleSettings, emptySavedFormState);
  const options = [{ value: "", label: "Any selected calendar" }, ...calendars.map((calendar) => ({ value: calendar.primary ? "primary" : calendar.id, label: calendar.primary ? `${calendar.summary} (primary)` : calendar.summary }))];
  // Google may be unreachable: keep the saved choice selectable rather than silently dropping it.
  if (calendarId && !options.some((option) => option.value === calendarId)) options.push({ value: calendarId, label: calendarId === "primary" ? "Primary calendar" : "Saved calendar" });

  return <form action={formAction} className="grid gap-3 rounded-2xl border p-4">
    <input type="hidden" name="jobId" value={jobId} />
    <p className="text-xs font-semibold uppercase tracking-[0.12em] text-[var(--muted-foreground)]">Google Calendar</p>
    <div className="grid gap-3 sm:grid-cols-2">
      <label className="field-label text-xs"><span>Title keyword</span><input name="keyword" defaultValue={keyword ?? ""} maxLength={80} placeholder={jobName} className="field-control h-10 text-sm" /></label>
      <div className="field-label text-xs"><span id={`google-calendar-${jobId}`}>Calendar</span><PremiumSelect name="calendarId" defaultValue={calendarId ?? ""} options={options} labelledBy={`google-calendar-${jobId}`} /></div>
    </div>
    <p className="text-xs leading-5 text-[var(--muted-foreground)]">Google events with the keyword as whole words in the title are this job&apos;s shifts (at least 2 characters). Leave it blank to use the job name. Changing the keyword or calendar stops matching old events; their shifts are kept.</p>
    <label className="flex min-h-11 items-start gap-3 rounded-xl px-1 text-sm">
      <input type="checkbox" name="sync" defaultChecked={sync} className="mt-1 size-4 accent-[var(--primary)]" />
      <span><span className="font-semibold">Add shifts from Google Calendar automatically</span><span className="block text-xs leading-5 text-[var(--muted-foreground)]">Matching events become shifts, and upcoming ones follow changes in Google. Shifts you have already worked never change, and shifts you typed in yourself are never deleted by sync.</span></span>
    </label>
    {state.message && <p role="alert" className="text-sm font-medium text-[var(--danger)]">{state.message}</p>}
    {state.savedAt && !state.message && <p role="status" className="text-sm text-[var(--success)]">Saved.</p>}
    <div className="flex justify-end"><Button size="sm" variant="outline" type="submit" disabled={pending}>{pending ? "Saving…" : "Save Google settings"}</Button></div>
  </form>;
}
