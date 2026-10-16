"use client";

import { useActionState, useId, useState } from "react";
import Link from "next/link";
import { Check } from "lucide-react";
import { addJobDeduction, createJob, updateJobDetails } from "@/app/actions/work";
import { emptyFormState } from "@/lib/form-state";
import { Button, PendingLabel } from "@/components/ui/button";
import { JOB_COLORS } from "@/components/jobs/job-colors";
import { PayScheduleFields } from "@/components/jobs/pay-schedule-fields";
import { SettingsGroup } from "@/components/settings/settings-section";
import type { PaySchedule } from "@/lib/pay-period";
import { cn } from "@/lib/utils";

/**
 * A rejected mutation, rendered where the person who typed the value is looking.
 * These actions previously threw their message, which meant a mistyped rate hit
 * the error overlay in development and a blank failure in production.
 */
function FormError({ message }: { message: string }) {
  if (!message) return null;
  return <p role="alert" className="rounded-xl border border-[color-mix(in_srgb,var(--danger)_35%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2.5 text-sm font-medium text-[var(--danger)]">{message}</p>;
}

/** Helper text under a field. A `small`, not a span: `.field-label > span` is unlayered CSS and would recolour it. */
function Hint({ children }: { children: React.ReactNode }) {
  return <small className="block text-xs font-normal leading-5 text-[var(--muted-foreground)]">{children}</small>;
}

const linkClass = "font-semibold text-[var(--primary)] underline-offset-4 hover:underline";

function ColorField({ defaultValue }: { defaultValue: string }) {
  const [color, setColor] = useState(defaultValue);
  // One per form: a fixed id here was shared by every job on the old list page,
  // so each group announced the first one's label.
  const labelId = useId();

  return <div className="field-label">
    <span id={labelId}>Color</span>
    <input type="hidden" name="color" value={color} />
    <div className="flex flex-wrap items-center gap-2" role="group" aria-labelledby={labelId}>
      {JOB_COLORS.map((swatch) => {
        const selected = swatch.toLowerCase() === color.toLowerCase();
        return <button
          key={swatch}
          type="button"
          aria-label={`Use colour ${swatch}`}
          aria-pressed={selected}
          onClick={() => setColor(swatch)}
          className={cn("grid size-11 place-items-center rounded-xl transition-transform hover:scale-110 sm:size-8 focus-visible:ring-4 focus-visible:ring-[var(--primary-soft)]", selected && "ring-2 ring-[var(--foreground)] ring-offset-2 ring-offset-[var(--card)]")}
          style={{ background: swatch }}
        >
          {selected && <Check className="size-4 text-white" strokeWidth={3} />}
        </button>;
      })}
      <label className="ml-1 flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border px-2.5 py-1.5 text-xs font-semibold sm:min-h-0 text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-subtle)]">
        <input type="color" value={color} onChange={(event) => setColor(event.target.value)} className="size-5 cursor-pointer rounded border-0 bg-transparent p-0" />
        Custom
      </label>
    </div>
  </div>;
}

type JobFieldValues = { name: string; color: string; hourlyRate: string; taxRate: string; weeklyLimitHours: string; paySchedule: PaySchedule | null };

/**
 * The fields both job forms share, in labelled groups. One form and one Save
 * either way: `createJob` and `updateJobDetails` validate these together (the
 * tax rate is checked against the deductions), so the groups only split them
 * for reading. The input names are the actions' contract.
 */
function JobFields({ prefix, values, today, isNew }: { prefix: string; values: JobFieldValues; today: string; isNew: boolean }) {
  return <>
    <SettingsGroup id={`${prefix}-basics`} title="Basics">
      <label className="field-label"><span>Job name</span><input name="name" defaultValue={values.name} required maxLength={80} className="field-control" placeholder="e.g. Campus desk" /></label>
      <ColorField defaultValue={values.color} />
    </SettingsGroup>

    <SettingsGroup id={`${prefix}-pay`} title="Pay" description={isNew ? "Copied onto every shift you log for this job." : "Changes apply to shifts you add from now on. Shifts already logged keep the pay they were saved with."}>
      <div className="grid grid-cols-2 gap-3">
        <label className="field-label"><span>Hourly rate ($)</span><input name="hourlyRate" required inputMode="decimal" defaultValue={values.hourlyRate} placeholder="18.50" className="field-control" /></label>
        <label className="field-label"><span>Tax rate (%)</span><input name="taxRate" required inputMode="decimal" defaultValue={values.taxRate} className="field-control" /></label>
      </div>
    </SettingsGroup>

    <SettingsGroup id={`${prefix}-limit`} title="Weekly limit">
      <label className="field-label">
        <span>Most hours you can work for this job in a week</span>
        <input name="weeklyLimitHours" type="number" min={1} max={168} step="0.25" defaultValue={values.weeklyLimitHours} placeholder="No limit" className="field-control sm:max-w-56" />
        <Hint>Leave blank for no limit. Your limit across all jobs is in <Link href="/settings#week" className={linkClass}>Settings</Link>.</Hint>
      </label>
    </SettingsGroup>

    <SettingsGroup id={`${prefix}-pay-period`} title="Pay period" description="Optional. Shows each pay period's hours and pay on your dashboard.">
      <PayScheduleFields schedule={values.paySchedule} today={today} framed={false} />
    </SettingsGroup>
  </>;
}

export function CreateJobForm({ today, defaultColor = JOB_COLORS[0] }: { today: string; defaultColor?: string }) {
  const [state, formAction, pending] = useActionState(createJob, emptyFormState);

  return <form action={formAction} className="grid gap-5">
    <JobFields prefix="new-job" today={today} isNew values={{ name: "", color: defaultColor, hourlyRate: "", taxRate: "0", weeklyLimitHours: "", paySchedule: null }} />
    <FormError message={state.message} />
    <div className="flex flex-col-reverse gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-xs leading-5 text-[var(--muted-foreground)]">Next, you can add deductions and calendar settings on the job&apos;s page.</p>
      <Button type="submit" disabled={pending}><PendingLabel pending={pending} label="Create job" pendingLabel="Creating…" /></Button>
    </div>
  </form>;
}

type JobDetailsFormProps = { id: string; name: string; hourlyRateCents: number; taxRateBasisPoints: number; color: string; weeklyLimitMinutes: number | null; paySchedule: PaySchedule | null; today: string };

export function JobDetailsForm({ id, name, hourlyRateCents, taxRateBasisPoints, color, weeklyLimitMinutes, paySchedule, today }: JobDetailsFormProps) {
  const [state, formAction, pending] = useActionState(updateJobDetails, emptyFormState);

  return <form action={formAction} className="grid gap-5">
    <input type="hidden" name="id" value={id} />
    <JobFields prefix={`job-${id}`} today={today} isNew={false} values={{ name, color, hourlyRate: (hourlyRateCents / 100).toFixed(2), taxRate: (taxRateBasisPoints / 100).toFixed(2), weeklyLimitHours: weeklyLimitMinutes ? String(weeklyLimitMinutes / 60) : "", paySchedule }} />
    <FormError message={state.message} />
    <div className="flex justify-end border-t pt-5">
      <Button type="submit" disabled={pending}><PendingLabel pending={pending} label="Save changes" pendingLabel="Saving…" /></Button>
    </div>
  </form>;
}

export function AddDeductionForm({ jobId }: { jobId: string }) {
  const [state, formAction, pending] = useActionState(addJobDeduction, emptyFormState);

  return <form action={formAction} className="grid gap-3">
    <input type="hidden" name="jobId" value={jobId} />
    <div className="grid gap-3 sm:grid-cols-[1fr_8rem_auto] sm:items-end">
      <label className="field-label"><span>Deduction name</span><input name="name" required maxLength={80} placeholder="e.g. Retirement" className="field-control" /></label>
      <label className="field-label"><span>Rate (%)</span><input name="rate" required placeholder="3.00" inputMode="decimal" className="field-control" /></label>
      <Button type="submit" variant="outline" disabled={pending}><PendingLabel pending={pending} label="Add deduction" pendingLabel="Adding…" /></Button>
    </div>
    <FormError message={state.message} />
  </form>;
}
