"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { deleteBreakPeriod, saveBreakPeriod } from "@/app/actions/work";
import { Button, PendingLabel } from "@/components/ui/button";
import { SettingsGroup } from "@/components/settings/settings-section";
import { useSettingsFormDirty } from "@/components/settings/use-settings-form-dirty";
import type { BreakPeriod, BreakPeriodActionState, BreakPeriodImpact } from "@/lib/break-periods";
import { emptySavedFormState } from "@/lib/form-state";
import { formatMinutes } from "@/lib/utils";

const dateLabel = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });
const formatDate = (date: string) => dateLabel.format(new Date(`${date}T12:00:00Z`));

function BreakImpact({ impact, pending }: { impact: BreakPeriodImpact; pending: boolean }) {
  const heading = useRef<HTMLParagraphElement>(null);
  useEffect(() => { heading.current?.focus(); }, []);
  return <div className="grid gap-2 rounded-xl border border-[var(--warning)] p-3 text-sm">
    <p ref={heading} tabIndex={-1} className="font-semibold">These weeks would be over the new cap</p>
    <ul className="grid gap-1">
      {impact.weeks.map((week) => <li key={week.week_start} className="flex flex-wrap justify-between gap-x-4">
        <span>Week of {formatDate(week.week_start)}</span>
        <span className="tabular-nums">{formatMinutes(week.scheduled_minutes)} scheduled / {formatMinutes(week.cap_minutes)} cap</span>
      </li>)}
    </ul>
    <input type="hidden" name="confirmation" value={impact.confirmation} />
    <label className="flex min-h-11 cursor-pointer items-center gap-2 border-t pt-2">
      <input type="checkbox" name="acknowledgeImpact" required disabled={pending} className="size-5 shrink-0 accent-[var(--primary)]" />
      <span>I understand that these weeks will be over the cap.</span>
    </label>
  </div>;
}

function PeriodEditor({ period, onClose, onSaved }: {
  period?: BreakPeriod;
  onClose: () => void;
  onSaved: () => void;
}) {
  const startField = useRef<HTMLInputElement>(null);
  useEffect(() => { startField.current?.focus(); }, []);
  const [showImpact, setShowImpact] = useState(false);
  const initial = {
    startDate: period?.start_date ?? "",
    endDate: period?.end_date ?? "",
    weeklyLimitHours: period ? String(period.weekly_limit_minutes / 60) : "",
    label: period?.label ?? "",
  };
  const [fields, setFields] = useState(initial);
  useSettingsFormDirty(
    fields.startDate !== initial.startDate ||
    fields.endDate !== initial.endDate ||
    fields.weeklyLimitHours !== initial.weeklyLimitHours ||
    fields.label !== initial.label,
  );
  const [state, action, pending] = useActionState<BreakPeriodActionState, FormData>(async (_previous, formData) => {
    const result = await saveBreakPeriod(period?.id ?? null, formData);
    if (result.savedAt !== null) onSaved();
    setShowImpact(Boolean(result.impact));
    return result;
  }, emptySavedFormState);
  const impact = showImpact ? state.impact : undefined;
  const change = (field: keyof typeof fields, value: string) => {
    setShowImpact(false);
    setFields((current) => ({ ...current, [field]: value }));
  };

  return <form action={action} className="grid gap-3">
    <fieldset disabled={pending} className="grid min-w-0 gap-3 sm:grid-cols-2">
      <label className="field-label"><span>Start date</span>
        <input ref={startField} className="field-control" name="startDate" type="date" min="0001-01-01" max="9999-12-31" required value={fields.startDate} onChange={(event) => change("startDate", event.target.value)} />
      </label>
      <label className="field-label"><span>End date</span>
        <input className="field-control" name="endDate" type="date" min={fields.startDate || "0001-01-01"} max="9999-12-31" required value={fields.endDate} onChange={(event) => change("endDate", event.target.value)} />
      </label>
      <label className="field-label"><span>Weekly cap (hours)</span>
        <input className="field-control" name="weeklyLimitHours" type="number" min="0.01" max="168" step="any" required value={fields.weeklyLimitHours} onChange={(event) => change("weeklyLimitHours", event.target.value)} />
      </label>
      <label className="field-label"><span>Label (optional)</span>
        <input className="field-control" name="label" maxLength={100} placeholder="Winter break" value={fields.label} onChange={(event) => change("label", event.target.value)} />
      </label>
    </fieldset>
    {state.message && <p role="alert" className="text-sm text-[var(--danger)]">{state.message}</p>}
    {impact && <BreakImpact key={impact.confirmation} impact={impact} pending={pending} />}
    <div className="flex flex-wrap justify-end gap-2">
      <Button type="button" variant="ghost" disabled={pending} onClick={onClose}>Cancel</Button>
      <Button type="submit" disabled={pending}><PendingLabel pending={pending} label={impact ? "Confirm and save" : "Save break period"} pendingLabel="Saving…" /></Button>
    </div>
  </form>;
}

function PeriodRemoval({ period, onClose, onDeleted }: { period: BreakPeriod; onClose: () => void; onDeleted: () => void }) {
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => { cancel.current?.focus(); }, []);
  const [state, action, pending] = useActionState<BreakPeriodActionState, FormData>(async (_previous, formData) => {
    const result = await deleteBreakPeriod(period.id, formData);
    if (result.savedAt !== null) onDeleted();
    return result;
  }, emptySavedFormState);
  return <form action={action} className="grid gap-2">
    <p className="text-sm">Delete this break period? Affected weeks will use your default weekly cap.</p>
    {state.message && <p role="alert" className="text-sm text-[var(--danger)]">{state.message}</p>}
    {state.impact && <BreakImpact key={state.impact.confirmation} impact={state.impact} pending={pending} />}
    <div className="flex flex-wrap justify-end gap-2">
      <Button ref={cancel} type="button" variant="ghost" disabled={pending} onClick={onClose}>Cancel</Button>
      <Button type="submit" variant="danger" disabled={pending}><PendingLabel pending={pending} label={state.impact ? "Confirm and delete" : "Delete break period"} pendingLabel="Deleting…" /></Button>
    </div>
  </form>;
}

export function BreakPeriodsForm({ periods, bare = false }: { periods: BreakPeriod[]; /** In its own Settings pane: no rule above, heading for screen readers only. */ bare?: boolean }) {
  const [selection, setSelection] = useState<{ id: string; mode: "edit" | "delete" } | "add" | null>(null);
  const [status, setStatus] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const addButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (selection === null && trigger.current) {
      (trigger.current.isConnected ? trigger.current : addButton.current)?.focus();
      trigger.current = null;
    }
  }, [selection]);
  const select = (value: typeof selection, button: HTMLButtonElement) => {
    trigger.current = button;
    setStatus("");
    setSelection(value);
  };
  const close = () => setSelection(null);
  const finish = (message: string) => {
    close();
    setStatus(message);
  };

  return <SettingsGroup id="break-periods" title="Break periods" description="When the first day of your workweek falls within these dates, the break cap applies for the whole week. Both dates count. Per-job limits still apply." className={bare ? "scroll-mt-6" : "mt-5 scroll-mt-6 !border-t !pt-5"} hideHeading={bare}>
    {periods.length > 0 && <ul className="grid gap-3">
      {periods.map((period) => <li key={period.id} className="grid min-w-0 gap-3 rounded-xl border p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="break-words text-sm font-semibold">{period.label ?? "Break period"} · {formatMinutes(period.weekly_limit_minutes)} per week</p>
            <p className="mt-1 text-xs text-[var(--muted-foreground)]">{formatDate(period.start_date)} – {formatDate(period.end_date)}</p>
          </div>
          <div className="flex gap-1">
            <Button type="button" variant="ghost" size="sm" disabled={selection !== null} onClick={(event) => select({ id: period.id, mode: "edit" }, event.currentTarget)}>Edit</Button>
            <Button type="button" variant="ghost" size="sm" disabled={selection !== null} onClick={(event) => select({ id: period.id, mode: "delete" }, event.currentTarget)}>Delete</Button>
          </div>
        </div>
        {selection && selection !== "add" && selection.id === period.id && (
          selection.mode === "edit"
            ? <PeriodEditor period={period} onClose={close} onSaved={() => finish("Break period saved.")} />
            : <PeriodRemoval period={period} onClose={close} onDeleted={() => finish("Break period deleted.")} />
        )}
      </li>)}
    </ul>}
    {selection === "add" && <PeriodEditor onClose={close} onSaved={() => finish("Break period added.")} />}
    {selection === null && <div><Button ref={addButton} type="button" variant="outline" onClick={(event) => select("add", event.currentTarget)}>Add break period</Button></div>}
    {status && <p role="status" className="text-sm text-[var(--muted-foreground)]">{status}</p>}
  </SettingsGroup>;
}
