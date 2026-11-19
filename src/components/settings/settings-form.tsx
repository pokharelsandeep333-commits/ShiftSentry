"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { updateSettings } from "@/app/actions/work";
import { emptyFormState } from "@/lib/form-state";
import { Button, PendingLabel } from "@/components/ui/button";
import { PremiumSelect, type SelectOption } from "@/components/ui/premium-select";
import { SettingsGroup } from "@/components/settings/settings-section";
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
 * Profile and work week. One form and one Save, because `updateSettings`
 * validates and writes all four fields together; the two groups only split
 * them for reading. The field names are the action's contract, so keep them.
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

  return <form action={formAction} className="grid gap-5">
    <fieldset disabled={pending} className="grid min-w-0 gap-5">
      <SettingsGroup id="settings-profile" title="Profile">
        <label className="field-label">
          <span>Display name</span>
          <input name="displayName" value={fields.displayName} onChange={(event) => change("displayName", event.target.value)} maxLength={100} autoComplete="name" className="field-control" />
          <small className="block text-xs font-normal leading-5 text-[var(--muted-foreground)]">Used in your dashboard greeting and as your name when you join an Imposter room.</small>
        </label>
        {email && <p className="text-xs leading-5 text-[var(--muted-foreground)]">Signed in as <span className="font-semibold text-[var(--foreground)]">{email}</span></p>}
      </SettingsGroup>

      <SettingsGroup id="settings-week" title="How your week is counted" description="Every total, limit and pay period is worked out in this time zone.">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="field-label">
            <span id="time-zone-label">Time zone</span>
            <PremiumSelect key={timeZone} name="timeZone" defaultValue={timeZone} options={timeZones} labelledBy="time-zone-label" onValueChange={(value) => change("timeZone", value)} />
          </div>
          <div className="field-label">
            <span id="week-start-label">Week starts on</span>
            <PremiumSelect key={weekStartsOn} name="weekStartsOn" defaultValue={String(weekStartsOn)} options={weekdays.map((day, value) => ({ value: String(value), label: day }))} labelledBy="week-start-label" onValueChange={(value) => change("weekStartsOn", Number(value))} />
          </div>
        </div>
        <p className="-mt-1 text-xs leading-5 text-[var(--muted-foreground)]" aria-live="polite">Your week runs {weekdays[fields.weekStartsOn]} to {weekdays[(fields.weekStartsOn + 6) % 7]}.</p>

        <label className="field-label">
          <span>Default weekly hour limit, all jobs combined</span>
          <input name="globalWeeklyLimitHours" type="number" min={1} max={168} value={fields.globalWeeklyLimitHours} onChange={(event) => change("globalWeeklyLimitHours", event.target.value)} className="field-control sm:max-w-56" placeholder="No limit" />
          <small className="block text-xs font-normal leading-5 text-[var(--muted-foreground)]">Leave blank for no limit. A job can also have its own limit, set on <Link href="/jobs" className="font-semibold text-[var(--primary)] underline-offset-4 hover:underline">Jobs</Link>.</small>
        </label>
      </SettingsGroup>
    </fieldset>

    {state.message && <p role="alert" className="rounded-xl border border-[color-mix(in_srgb,var(--danger)_35%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2.5 text-sm font-medium text-[var(--danger)]">{state.message}</p>}

    <div className="flex justify-end border-t pt-5">
      <Button type="submit" disabled={pending}><PendingLabel pending={pending} label="Save changes" pendingLabel="Saving…" /></Button>
    </div>
  </form>;
}
