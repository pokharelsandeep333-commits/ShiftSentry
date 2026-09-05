"use client";

import { useActionState, useState } from "react";
import { Check } from "lucide-react";
import { addJobDeduction, createJob, updateJobDetails } from "@/app/actions/work";
import { emptyFormState } from "@/lib/form-state";
import { Button } from "@/components/ui/button";
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

/**
 * Job colours are not decoration: they key the stacked bars, the legend, the
 * dots beside every total, and the icon tint on each shift row. A free colour
 * well happily returns something that vanishes against the card in one theme or
 * the other, so offer a palette that stays legible in both and keep the native
 * picker as the deliberate way out.
 */
const JOB_COLORS = ["#6d5ce7", "#0ea5e9", "#12b76a", "#f79009", "#f04438", "#ec4899", "#8b5cf6", "#14b8a6"];

function ColorField({ defaultValue }: { defaultValue: string }) {
  const [color, setColor] = useState(defaultValue);

  return <div className="field-label">
    <span id="job-color-label">Color</span>
    <input type="hidden" name="color" value={color} />
    <div className="flex flex-wrap items-center gap-2" role="group" aria-labelledby="job-color-label">
      {JOB_COLORS.map((swatch) => {
        const selected = swatch.toLowerCase() === color.toLowerCase();
        return <button
          key={swatch}
          type="button"
          aria-label={`Use colour ${swatch}`}
          aria-pressed={selected}
          onClick={() => setColor(swatch)}
          className={cn("grid size-8 place-items-center rounded-xl transition-transform hover:scale-110 focus-visible:ring-4 focus-visible:ring-[var(--primary-soft)]", selected && "ring-2 ring-[var(--foreground)] ring-offset-2 ring-offset-[var(--card)]")}
          style={{ background: swatch }}
        >
          {selected && <Check className="size-4 text-white" strokeWidth={3} />}
        </button>;
      })}
      <label className="ml-1 flex cursor-pointer items-center gap-2 rounded-xl border px-2.5 py-1.5 text-xs font-semibold text-[var(--muted-foreground)] transition-colors hover:bg-[var(--surface-subtle)]">
        <input type="color" value={color} onChange={(event) => setColor(event.target.value)} className="size-5 cursor-pointer rounded border-0 bg-transparent p-0" />
        Custom
      </label>
    </div>
  </div>;
}

export function CreateJobForm() {
  const [state, formAction, pending] = useActionState(createJob, emptyFormState);

  return <form action={formAction} className="grid gap-4">
    <label className="field-label"><span>Job name</span><input name="name" required maxLength={80} className="field-control" placeholder="e.g. Campus desk" /></label>
    <div className="grid grid-cols-2 gap-3">
      <label className="field-label"><span>Hourly rate ($)</span><input name="hourlyRate" required inputMode="decimal" placeholder="18.50" className="field-control" /></label>
      <label className="field-label"><span>Tax rate (%)</span><input name="taxRate" required inputMode="decimal" defaultValue="0" className="field-control" /></label>
    </div>
    <ColorField defaultValue={JOB_COLORS[0]} />
    <label className="field-label"><span>Weekly limit (hours)</span><input name="weeklyLimitHours" type="number" min={1} max={168} className="field-control" placeholder="Leave blank for no limit" /></label>
    <FormError message={state.message} />
    <p className="rounded-xl bg-[var(--surface-subtle)] px-3 py-2.5 text-xs leading-5 text-[var(--muted-foreground)]">You can add named percentage deductions after creating the job.</p>
    <Button type="submit" disabled={pending}>{pending ? "Creating…" : "Create job"}</Button>
  </form>;
}

type JobDetailsFormProps = { id: string; name: string; hourlyRateCents: number; taxRateBasisPoints: number; color: string; weeklyLimitMinutes: number | null };

export function JobDetailsForm({ id, name, hourlyRateCents, taxRateBasisPoints, color, weeklyLimitMinutes }: JobDetailsFormProps) {
  const [state, formAction, pending] = useActionState(updateJobDetails, emptyFormState);

  return <form action={formAction} className="grid gap-3">
    <input type="hidden" name="id" value={id} />
    <label className="field-label text-xs"><span>Job name</span><input name="name" defaultValue={name} required maxLength={80} className="field-control h-10 text-sm" /></label>
    <div className="grid gap-3 sm:grid-cols-3">
      <label className="field-label text-xs"><span>Hourly rate ($)</span><input name="hourlyRate" type="text" inputMode="decimal" defaultValue={(hourlyRateCents / 100).toFixed(2)} className="field-control h-10 text-sm" /></label>
      <label className="field-label text-xs"><span>Tax (%)</span><input name="taxRate" type="text" inputMode="decimal" defaultValue={(taxRateBasisPoints / 100).toFixed(2)} className="field-control h-10 text-sm" /></label>
      <label className="field-label text-xs"><span>Weekly limit (h)</span><input name="weeklyLimitHours" type="number" min={1} max={168} step="0.25" defaultValue={weeklyLimitMinutes ? weeklyLimitMinutes / 60 : ""} placeholder="No cap" className="field-control h-10 text-sm" /></label>
    </div>
    <ColorField defaultValue={color} />
    <FormError message={state.message} />
    <div className="flex justify-end">
      <Button size="sm" type="submit" disabled={pending}>{pending ? "Saving…" : "Save job"}</Button>
    </div>
  </form>;
}

export function AddDeductionForm({ jobId }: { jobId: string }) {
  const [state, formAction, pending] = useActionState(addJobDeduction, emptyFormState);

  return <form action={formAction} className="mt-3 grid gap-2">
    <input type="hidden" name="jobId" value={jobId} />
    <div className="grid gap-2 sm:grid-cols-[1fr_110px_auto]">
      <input name="name" required maxLength={80} placeholder="e.g. Retirement" className="field-control h-10 text-sm" />
      <input name="rate" required placeholder="3.00" inputMode="decimal" className="field-control h-10 text-sm" />
      <Button size="sm" type="submit" disabled={pending}>{pending ? "Adding…" : "Add"}</Button>
    </div>
    <FormError message={state.message} />
  </form>;
}
