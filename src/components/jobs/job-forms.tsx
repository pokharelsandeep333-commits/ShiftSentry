"use client";

import { useActionState, useId, useState, type CSSProperties } from "react";
import Link from "next/link";
import { Check, Plus } from "lucide-react";
import { addJobDeduction, createJob, updateJobDetails } from "@/app/actions/work";
import { emptyFormState, type FieldErrors } from "@/lib/form-state";
import { Button, PendingLabel } from "@/components/ui/button";
import { FormError, fieldA11y } from "@/components/ui/field-error";
import { useActionForm } from "@/components/ui/use-action-form";
import { textOn } from "@/components/calendar/item-style";
import { JOB_COLORS, JOB_COLOR_NAMES } from "@/components/jobs/job-colors";
import { PayScheduleFields } from "@/components/jobs/pay-schedule-fields";
import { FieldAffix, SettingRow } from "@/components/settings/setting-row";
import type { PaySchedule } from "@/lib/pay-period";
import { cn } from "@/lib/utils";

const linkClass = "font-semibold text-[var(--primary)] transition-colors hover:text-[color-mix(in_srgb,var(--primary)_72%,var(--foreground))]";

/** The row of buttons under every job form: one primary button, right-aligned, over a hairline. */
export function FormFooter({ note, children }: { note?: React.ReactNode; children: React.ReactNode }) {
  return <div className={cn("flex flex-col-reverse gap-3 border-t pt-5 sm:flex-row sm:items-center", note ? "sm:justify-between" : "sm:justify-end")}>
    {note && <p className="text-xs leading-5 text-[var(--muted-foreground)]">{note}</p>}
    {children}
  </div>;
}

/** The chosen swatch's ring: its own colour, pulled toward the text colour so a pale custom colour still shows a ring. */
const ringFor = (color: string) => `color-mix(in srgb, ${color} 72%, var(--foreground))`;

function ColorField({ defaultValue, error, errorId }: { defaultValue: string; error?: string; errorId: string }) {
  const [color, setColor] = useState(defaultValue);
  // One per form: a fixed id here was shared by every job on the old list page,
  // so each group announced the first one's label.
  const labelId = useId();

  const custom = !JOB_COLORS.some((swatch) => swatch.toLowerCase() === color.toLowerCase());
  const radioName = `${labelId}-swatch`;

  // Circles, as in most colour-label pickers: a native radio group (arrows move
  // the choice, one tab stop), each swatch ringed in its own colour when chosen.
  // The last circle opens the native colour well; it shows the custom colour
  // once one is picked, and the conic wheel until then.
  const swatchClass = "relative grid size-11 cursor-pointer place-items-center rounded-full sm:size-9";
  const dotClass = "grid size-7 place-items-center rounded-full shadow-[inset_0_0_0_1px_rgb(0_0_0/0.1)] transition-[transform,box-shadow] duration-150 sm:size-6";
  const ringClass = "ring-2 ring-offset-2 ring-offset-[var(--card)]";
  const focusClass = "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-1 has-[:focus-visible]:outline-[var(--primary)]";

  return <SettingRow label="Colour" labelId={labelId} hint="Marks this job on charts and the calendar." wide error={error} errorId={errorId}>
    <input type="hidden" name="color" value={color} />
    <div className="flex flex-wrap items-center gap-0.5 sm:justify-end" role="radiogroup" aria-labelledby={labelId} aria-describedby={error ? errorId : undefined}>
      {JOB_COLORS.map((swatch) => {
        const selected = swatch.toLowerCase() === color.toLowerCase();
        const name = JOB_COLOR_NAMES[swatch] ?? swatch;
        return <label key={swatch} title={name} className={cn(swatchClass, focusClass, "group")}>
          <input type="radio" name={radioName} value={swatch} checked={selected} onChange={() => setColor(swatch)} aria-label={name} className="sr-only" />
          <span aria-hidden="true" className={cn(dotClass, selected ? ringClass : "group-hover:scale-110")} style={{ background: swatch, ...(selected ? { "--tw-ring-color": ringFor(swatch) } : {}) } as CSSProperties}>
            {selected && <Check className="size-3.5" style={{ color: textOn(swatch) }} strokeWidth={3} />}
          </span>
        </label>;
      })}
      <span aria-hidden="true" className="mx-1.5 h-5 w-px bg-[var(--border)]" />
      <label title={custom ? `Custom colour ${color}` : "Pick a custom colour"} className={cn(swatchClass, focusClass, "group")}>
        <input type="color" value={color} onChange={(event) => setColor(event.target.value)} aria-label="Custom colour" className="absolute inset-0 size-full cursor-pointer opacity-0" />
        <span aria-hidden="true" className={cn(dotClass, "pointer-events-none", custom ? ringClass : "group-hover:scale-110")} style={custom ? { background: color, "--tw-ring-color": ringFor(color) } as CSSProperties : { background: "conic-gradient(from 90deg, #f04438, #f79009, #facc15, #12b76a, #0ea5e9, #6d5ce7, #ec4899, #f04438)" }}>
          {custom ? <Check className="size-3.5" style={{ color: textOn(color) }} strokeWidth={3} /> : <Plus className="size-3.5 text-white drop-shadow-[0_0_1.5px_rgb(0_0_0/0.6)]" strokeWidth={3} />}
        </span>
      </label>
    </div>
  </SettingRow>;
}

type JobFieldValues = { name: string; color: string; hourlyRate: string; taxRate: string; weeklyLimitHours: string; paySchedule: PaySchedule | null };

/**
 * The fields both job forms share, as setting rows. One form and one Save
 * either way: `createJob` and `updateJobDetails` validate these together (the
 * tax rate is checked against the deductions). The input names are the
 * actions' contract, and the keys of `errors`.
 */
function JobFields({ prefix, values, today, isNew, errors }: { prefix: string; values: JobFieldValues; today: string; isNew: boolean; errors: FieldErrors }) {
  const fieldId = (field: string) => `${prefix}-${field}`;
  const errorId = (field: string) => `${prefix}-${field}-error`;
  const hintId = (field: string) => `${prefix}-${field}-hint`;

  return <div className="divide-y">
    <SettingRow label="Job name" labelFor={fieldId("name")} hint="How it shows on shifts, charts and the calendar." hintId={hintId("name")} error={errors.name} errorId={errorId("name")}>
      <input id={fieldId("name")} name="name" defaultValue={values.name} required maxLength={80} className="field-control" placeholder="e.g. Campus desk" {...fieldA11y(errorId("name"), errors.name, hintId("name"))} />
    </SettingRow>

    <ColorField defaultValue={values.color} error={errors.color} errorId={errorId("color")} />

    <SettingRow label="Hourly rate" labelFor={fieldId("rate")} hint={isNew ? "Copied onto every shift you log for this job." : "Applies to shifts you add from now on; logged shifts keep their pay."} hintId={hintId("rate")} error={errors.hourlyRate} errorId={errorId("rate")}>
      <div className="relative">
        <FieldAffix side="left">$</FieldAffix>
        <input id={fieldId("rate")} name="hourlyRate" required inputMode="decimal" defaultValue={values.hourlyRate} placeholder="18.50" className="field-control !pl-8" {...fieldA11y(errorId("rate"), errors.hourlyRate, hintId("rate"))} />
      </div>
    </SettingRow>

    <SettingRow label="Tax rate" labelFor={fieldId("tax")} hint="The share of gross pay withheld for tax." hintId={hintId("tax")} error={errors.taxRate} errorId={errorId("tax")}>
      <div className="relative">
        <input id={fieldId("tax")} name="taxRate" required inputMode="decimal" defaultValue={values.taxRate} className="field-control !pr-10" {...fieldA11y(errorId("tax"), errors.taxRate, hintId("tax"))} />
        <FieldAffix>%</FieldAffix>
      </div>
    </SettingRow>

    <SettingRow label="Weekly limit" labelFor={fieldId("limit")} hint={<>Most hours for this job in a week. Blank for none; your limit across all jobs is in <Link href="/settings#week" className={linkClass}>Settings</Link>.</>} hintId={hintId("limit")} error={errors.weeklyLimitHours} errorId={errorId("limit")}>
      <div className="relative">
        <input id={fieldId("limit")} name="weeklyLimitHours" type="number" min={1} max={168} step="0.25" defaultValue={values.weeklyLimitHours} placeholder="No limit" className="field-control !pr-16" {...fieldA11y(errorId("limit"), errors.weeklyLimitHours, hintId("limit"))} />
        <FieldAffix>hours</FieldAffix>
      </div>
    </SettingRow>

    <PayScheduleFields schedule={values.paySchedule} today={today} errors={errors} />
  </div>;
}

export function CreateJobForm({ today, defaultColor = JOB_COLORS[0] }: { today: string; defaultColor?: string }) {
  const [state, formAction, pending] = useActionState(createJob, emptyFormState);
  const onSubmit = useActionForm(formAction, state);

  return <form action={formAction} onSubmit={onSubmit} className="grid gap-5">
    <JobFields prefix="new-job" today={today} isNew errors={state.fieldErrors ?? {}} values={{ name: "", color: defaultColor, hourlyRate: "", taxRate: "0", weeklyLimitHours: "", paySchedule: null }} />
    <FormError message={state.message} />
    <FormFooter note={<>Next, you can add deductions and calendar settings on the job&apos;s page.</>}>
      <Button type="submit" disabled={pending}><PendingLabel pending={pending} label="Create job" pendingLabel="Creating…" /></Button>
    </FormFooter>
  </form>;
}

type JobDetailsFormProps = { id: string; name: string; hourlyRateCents: number; taxRateBasisPoints: number; color: string; weeklyLimitMinutes: number | null; paySchedule: PaySchedule | null; today: string };

export function JobDetailsForm({ id, name, hourlyRateCents, taxRateBasisPoints, color, weeklyLimitMinutes, paySchedule, today }: JobDetailsFormProps) {
  const [state, formAction, pending] = useActionState(updateJobDetails, emptyFormState);
  const onSubmit = useActionForm(formAction, state);

  return <form action={formAction} onSubmit={onSubmit} className="grid gap-5">
    <input type="hidden" name="id" value={id} />
    <JobFields prefix={`job-${id}`} today={today} isNew={false} errors={state.fieldErrors ?? {}} values={{ name, color, hourlyRate: (hourlyRateCents / 100).toFixed(2), taxRate: (taxRateBasisPoints / 100).toFixed(2), weeklyLimitHours: weeklyLimitMinutes ? String(weeklyLimitMinutes / 60) : "", paySchedule }} />
    <FormError message={state.message} />
    <FormFooter>
      <Button type="submit" disabled={pending}><PendingLabel pending={pending} label="Save changes" pendingLabel="Saving…" /></Button>
    </FormFooter>
  </form>;
}

export function AddDeductionForm({ jobId }: { jobId: string }) {
  const [state, formAction, pending] = useActionState(addJobDeduction, emptyFormState);
  const onSubmit = useActionForm(formAction, state);
  const errors = state.fieldErrors ?? {};
  const prefix = `deduction-${jobId}`;

  return <form action={formAction} onSubmit={onSubmit} aria-labelledby={`${prefix}-title`} className="grid gap-5">
    <input type="hidden" name="jobId" value={jobId} />
    <div>
      <p id={`${prefix}-title`} className="text-sm font-semibold">Add a deduction</p>
      <div className="mt-5 divide-y">
        <SettingRow label="Name" labelFor={`${prefix}-name`} hint="Like retirement or union dues." hintId={`${prefix}-name-hint`} error={errors.name} errorId={`${prefix}-name-error`}>
          <input id={`${prefix}-name`} name="name" required maxLength={80} placeholder="e.g. Retirement" className="field-control" {...fieldA11y(`${prefix}-name-error`, errors.name, `${prefix}-name-hint`)} />
        </SettingRow>
        <SettingRow label="Rate" labelFor={`${prefix}-rate`} hint="The share of gross pay it takes." hintId={`${prefix}-rate-hint`} error={errors.rate} errorId={`${prefix}-rate-error`}>
          <div className="relative">
            <input id={`${prefix}-rate`} name="rate" required placeholder="3.00" inputMode="decimal" className="field-control !pr-10" {...fieldA11y(`${prefix}-rate-error`, errors.rate, `${prefix}-rate-hint`)} />
            <FieldAffix>%</FieldAffix>
          </div>
        </SettingRow>
      </div>
    </div>
    <FormError message={state.message} />
    <FormFooter>
      <Button type="submit" disabled={pending}><PendingLabel pending={pending} label="Add deduction" pendingLabel="Adding…" /></Button>
    </FormFooter>
  </form>;
}
