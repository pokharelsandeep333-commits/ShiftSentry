"use client";

import { useActionState, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { updateSettings } from "@/app/actions/work";
import { emptyFormState } from "@/lib/form-state";
import { Button, PendingLabel } from "@/components/ui/button";
import { PremiumSelect, type SelectOption } from "@/components/ui/premium-select";
import { useSettingsFormDirty } from "@/components/settings/use-settings-form-dirty";

const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type SettingsFormProps = {
  email: string;
  displayName: string;
  timeZone: string;
  timeZones: SelectOption[];
  weekStartsOn: number;
  globalWeeklyLimitMinutes: number | null;
  profileSaved: boolean;
};

/**
 * Profile and work week, as setting rows (label and hint left, control right).
 * One form and one Save, because `updateSettings` validates and writes all
 * four fields together. The field names are the action's contract, so keep them.
 */
export function SettingsForm({ email, displayName, timeZone, timeZones, weekStartsOn, globalWeeklyLimitMinutes, profileSaved }: SettingsFormProps) {
  const [state, formAction, pending] = useActionState(updateSettings, emptyFormState);
  const searchParams = useSearchParams();
  const globalWeeklyLimitHours = globalWeeklyLimitMinutes ? String(globalWeeklyLimitMinutes / 60) : "";
  const initial = { displayName, timeZone, weekStartsOn, globalWeeklyLimitHours };
  const [fields, setFields] = useState(initial);
  const saved = profileSaved && searchParams.get("saved") === "1";
  const [wasSaved, setWasSaved] = useState(saved);

  // updateSettings redirects only after a successful write. SavedToast then
  // removes the flag through history.replaceState, which updates useSearchParams.
  if (saved !== wasSaved) {
    setWasSaved(saved);
    if (saved) setFields(initial);
  }

  useSettingsFormDirty(
    fields.displayName !== displayName ||
    fields.timeZone !== timeZone ||
    fields.weekStartsOn !== weekStartsOn ||
    fields.globalWeeklyLimitHours !== globalWeeklyLimitHours,
  );

  function change<Field extends keyof typeof fields>(field: Field, value: (typeof fields)[Field]) {
    setFields((current) => ({ ...current, [field]: value }));
  }

  const jobsLink = <Link href="/jobs" className="font-semibold text-[var(--primary)] transition-colors hover:text-[color-mix(in_srgb,var(--primary)_72%,var(--foreground))]">Jobs</Link>;

  return <form action={formAction} className="grid gap-6">
    <fieldset disabled={pending} className="min-w-0 divide-y">
      <SettingRow label="Display name" labelFor="settings-display-name" hint="Shown in your greeting and in Imposter rooms." hintId="settings-display-name-hint">
        <input id="settings-display-name" name="displayName" value={fields.displayName} onChange={(event) => change("displayName", event.target.value)} maxLength={100} autoComplete="name" aria-describedby="settings-display-name-hint" className="field-control" />
      </SettingRow>
      {email && <SettingRow label="Email" hint="The account you sign in with.">
        <p className="truncate text-sm font-medium sm:text-right" title={email}>{email}</p>
      </SettingRow>}
      <SettingRow label="Time zone" labelId="time-zone-label" hint="Every total, limit and pay period is worked out here.">
        <PremiumSelect key={timeZone} name="timeZone" defaultValue={timeZone} options={timeZones} labelledBy="time-zone-label" onValueChange={(value) => change("timeZone", value)} />
      </SettingRow>
      <SettingRow label="Week starts on" labelId="week-start-label" hint={<span aria-live="polite">Your week runs {weekdays[fields.weekStartsOn]} to {weekdays[(fields.weekStartsOn + 6) % 7]}.</span>}>
        <PremiumSelect key={weekStartsOn} name="weekStartsOn" defaultValue={String(weekStartsOn)} options={weekdays.map((day, value) => ({ value: String(value), label: day }))} labelledBy="week-start-label" onValueChange={(value) => change("weekStartsOn", Number(value))} />
      </SettingRow>
      <SettingRow label="Weekly hour limit" labelFor="settings-weekly-limit" hint={<>All jobs combined. Leave blank for none; a job can have its own on {jobsLink}.</>} hintId="settings-weekly-limit-hint">
        <div className="relative">
          <input id="settings-weekly-limit" name="globalWeeklyLimitHours" type="number" min={1} max={168} value={fields.globalWeeklyLimitHours} onChange={(event) => change("globalWeeklyLimitHours", event.target.value)} aria-describedby="settings-weekly-limit-hint" className="field-control pr-16" placeholder="No limit" />
          <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 right-4 flex items-center text-sm text-[var(--muted-foreground)]">hours</span>
        </div>
      </SettingRow>
    </fieldset>

    {state.message && <p role="alert" className="rounded-xl border border-[color-mix(in_srgb,var(--danger)_35%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2.5 text-sm font-medium text-[var(--danger)]">{state.message}</p>}

    <div className="flex justify-end">
      <Button type="submit" disabled={pending}><PendingLabel pending={pending} label="Save changes" pendingLabel="Saving…" /></Button>
    </div>
  </form>;
}

/**
 * One setting as a row, as in a desktop settings window: the label and one
 * short hint on the left, the control in a fixed column on the right; stacked
 * on phones. `labelFor` labels a native input; `labelId` is for a control that
 * points at its label itself (`PremiumSelect`'s `labelledBy`).
 */
function SettingRow({ label, labelFor, labelId, hint, hintId, children }: { label: string; labelFor?: string; labelId?: string; hint: ReactNode; hintId?: string; children: ReactNode }) {
  return <div className="grid gap-3 py-5 first:pt-0 sm:grid-cols-[minmax(0,1fr)_16.5rem] sm:items-center sm:gap-8">
    <div className="min-w-0">
      {labelFor ? <label htmlFor={labelFor} className="text-sm font-semibold">{label}</label> : <p id={labelId} className="text-sm font-semibold">{label}</p>}
      <p id={hintId} className="mt-1 text-[13px] leading-5 text-[var(--muted-foreground)]">{hint}</p>
    </div>
    <div className="min-w-0">{children}</div>
  </div>;
}
