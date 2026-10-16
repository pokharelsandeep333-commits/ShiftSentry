"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { updateSettings } from "@/app/actions/work";
import { emptyFormState } from "@/lib/form-state";
import { Button, PendingLabel } from "@/components/ui/button";
import { PremiumSelect, type SelectOption } from "@/components/ui/premium-select";
import { SettingsGroup } from "@/components/settings/settings-section";

const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type SettingsFormProps = {
  email: string;
  displayName: string;
  timeZone: string;
  timeZones: SelectOption[];
  weekStartsOn: number;
  globalWeeklyLimitMinutes: number | null;
};

/**
 * Profile and work week. One form and one Save, because `updateSettings`
 * validates and writes all four fields together; the two groups only split
 * them for reading. The field names are the action's contract, so keep them.
 */
export function SettingsForm({ email, displayName, timeZone, timeZones, weekStartsOn, globalWeeklyLimitMinutes }: SettingsFormProps) {
  const [state, formAction, pending] = useActionState(updateSettings, emptyFormState);
  const [weekStart, setWeekStart] = useState(weekStartsOn);

  return <form action={formAction} className="grid gap-5">
    <SettingsGroup id="settings-profile" title="Profile">
      <label className="field-label">
        <span>Display name</span>
        <input name="displayName" defaultValue={displayName} maxLength={100} autoComplete="name" className="field-control" />
        <small className="block text-xs font-normal leading-5 text-[var(--muted-foreground)]">Used in your dashboard greeting and as your name when you join an Imposter room.</small>
      </label>
      {email && <p className="text-xs leading-5 text-[var(--muted-foreground)]">Signed in as <span className="font-semibold text-[var(--foreground)]">{email}</span></p>}
    </SettingsGroup>

    <SettingsGroup id="settings-week" title="How your week is counted" description="Every total, limit and pay period is worked out in this time zone.">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="field-label">
          <span id="time-zone-label">Time zone</span>
          <PremiumSelect name="timeZone" defaultValue={timeZone} options={timeZones} labelledBy="time-zone-label" />
        </div>
        <div className="field-label">
          <span id="week-start-label">Week starts on</span>
          <PremiumSelect name="weekStartsOn" defaultValue={String(weekStartsOn)} options={weekdays.map((day, value) => ({ value: String(value), label: day }))} labelledBy="week-start-label" onValueChange={(value) => setWeekStart(Number(value))} />
        </div>
      </div>
      <p className="-mt-1 text-xs leading-5 text-[var(--muted-foreground)]" aria-live="polite">Your week runs {weekdays[weekStart]} to {weekdays[(weekStart + 6) % 7]}.</p>

      <label className="field-label">
        <span>Weekly hour limit, all jobs combined</span>
        <input name="globalWeeklyLimitHours" type="number" min={1} max={168} defaultValue={globalWeeklyLimitMinutes ? globalWeeklyLimitMinutes / 60 : ""} className="field-control sm:max-w-56" placeholder="No limit" />
        <small className="block text-xs font-normal leading-5 text-[var(--muted-foreground)]">Leave blank for no limit. A job can also have its own limit, set on <Link href="/jobs" className="font-semibold text-[var(--primary)] underline-offset-4 hover:underline">Jobs</Link>.</small>
      </label>
    </SettingsGroup>

    {state.message && <p role="alert" className="rounded-xl border border-[color-mix(in_srgb,var(--danger)_35%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2.5 text-sm font-medium text-[var(--danger)]">{state.message}</p>}

    <div className="flex justify-end border-t pt-5">
      <Button type="submit" disabled={pending}><PendingLabel pending={pending} label="Save changes" pendingLabel="Saving…" /></Button>
    </div>
  </form>;
}
