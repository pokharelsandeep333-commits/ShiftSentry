"use client";

import { useActionState } from "react";
import { updateSettings } from "@/app/actions/work";
import { emptyFormState } from "@/lib/form-state";
import { Button } from "@/components/ui/button";
import { PremiumSelect, type SelectOption } from "@/components/ui/premium-select";

const weekdays = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

type SettingsFormProps = {
  displayName: string;
  timeZone: string;
  timeZones: SelectOption[];
  weekStartsOn: number;
  globalWeeklyLimitMinutes: number | null;
};

export function SettingsForm({ displayName, timeZone, timeZones, weekStartsOn, globalWeeklyLimitMinutes }: SettingsFormProps) {
  const [state, formAction, pending] = useActionState(updateSettings, emptyFormState);

  return <form action={formAction} className="grid gap-5">
    <label className="field-label"><span>Display name</span><input name="displayName" defaultValue={displayName} maxLength={100} className="field-control" /></label>

    <div className="field-label">
      <span id="time-zone-label">Time zone</span>
      <PremiumSelect name="timeZone" defaultValue={timeZone} options={timeZones} labelledBy="time-zone-label" />
    </div>

    <div className="field-label">
      <span id="week-start-label">Week starts on</span>
      <PremiumSelect name="weekStartsOn" defaultValue={String(weekStartsOn)} options={weekdays.map((day, value) => ({ value: String(value), label: day }))} labelledBy="week-start-label" />
    </div>

    <label className="field-label"><span>Global weekly limit (hours)</span><input name="globalWeeklyLimitHours" type="number" min={1} max={168} defaultValue={globalWeeklyLimitMinutes ? globalWeeklyLimitMinutes / 60 : ""} className="field-control" placeholder="Leave blank for no cap" /></label>

    {state.message && <p role="alert" className="rounded-xl border border-[color-mix(in_srgb,var(--danger)_35%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2.5 text-sm font-medium text-[var(--danger)]">{state.message}</p>}

    <div><Button type="submit" disabled={pending}>{pending ? "Saving…" : "Save settings"}</Button></div>
  </form>;
}
