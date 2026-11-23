"use client";

import { useActionState, useEffect, useRef } from "react";
import { saveJobGoogleSettings } from "@/app/actions/calendar";
import { runSync } from "@/components/google-sync-trigger";
import { FormFooter } from "@/components/jobs/job-forms";
import { SettingRow } from "@/components/settings/setting-row";
import { Button, PendingLabel } from "@/components/ui/button";
import { FormError, fieldA11y } from "@/components/ui/field-error";
import { PremiumSelect } from "@/components/ui/premium-select";
import { useActionForm } from "@/components/ui/use-action-form";
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
  const onSubmit = useActionForm(formAction, state);
  const errors = state.fieldErrors ?? {};
  const prefix = `google-${jobId}`;
  // Saved with sync on: pull this job's events in now rather than on the next
  // page visit, which could fall inside the five-minute throttle. Read at
  // submit, from the checkbox as it was sent.
  const syncOnSave = useRef(false);
  useEffect(() => {
    if (state.savedAt && !state.message && syncOnSave.current) runSync(true).catch(() => {});
  }, [state]);
  const options = [{ value: "", label: "Any selected calendar" }, ...calendars.map((calendar) => ({ value: calendar.primary ? "primary" : calendar.id, label: calendar.primary ? `${calendar.summary} (primary)` : calendar.summary }))];
  // Google may be unreachable: keep the saved choice selectable rather than silently dropping it.
  if (calendarId && !options.some((option) => option.value === calendarId)) options.push({ value: calendarId, label: calendarId === "primary" ? "Primary calendar" : "Saved calendar" });

  return <form action={formAction} onSubmit={(event) => { const box = event.currentTarget.elements.namedItem("sync"); syncOnSave.current = box instanceof HTMLInputElement && box.checked; onSubmit(event); }} className="grid gap-5">
    <input type="hidden" name="jobId" value={jobId} />
    <div className="divide-y">
      <SettingRow label="Title keyword" labelFor={`${prefix}-keyword`} hint="Events with it as whole words in the title. Blank uses the job name." hintId={`${prefix}-keyword-hint`} error={errors.keyword} errorId={`${prefix}-keyword-error`}>
        <input id={`${prefix}-keyword`} name="keyword" defaultValue={keyword ?? ""} maxLength={80} placeholder={jobName} className="field-control" {...fieldA11y(`${prefix}-keyword-error`, errors.keyword, `${prefix}-keyword-hint`)} />
      </SettingRow>
      <SettingRow label="Calendar" labelId={`${prefix}-calendar`} hint="Where to look for them." error={errors.calendarId} errorId={`${prefix}-calendar-error`}>
        <PremiumSelect name="calendarId" defaultValue={calendarId ?? ""} options={options} labelledBy={`${prefix}-calendar`} invalid={Boolean(errors.calendarId)} describedBy={errors.calendarId ? `${prefix}-calendar-error` : undefined} />
      </SettingRow>
      <SettingRow label="Add shifts automatically" labelFor={`${prefix}-sync`} hint="Matching events become shifts and follow changes in Google. Worked shifts and ones you typed never change." hintId={`${prefix}-sync-hint`} wide>
        <input id={`${prefix}-sync`} type="checkbox" name="sync" defaultChecked={sync} aria-describedby={`${prefix}-sync-hint`} className="size-5 accent-[var(--primary)]" />
      </SettingRow>
    </div>
    <FormError message={state.message} />
    {state.savedAt && !state.message && <p role="status" className="text-sm text-[var(--success)]">Saved.</p>}
    <FormFooter note="Changing the keyword or calendar stops matching old events; their shifts are kept.">
      <Button type="submit" disabled={pending}><PendingLabel pending={pending} label="Save calendar settings" pendingLabel="Saving…" /></Button>
    </FormFooter>
  </form>;
}
