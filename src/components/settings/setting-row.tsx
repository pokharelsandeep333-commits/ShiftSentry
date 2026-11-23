import type { ReactNode } from "react";
import { FieldError } from "@/components/ui/field-error";
import { cn } from "@/lib/utils";

/**
 * One setting as a row, as in a desktop settings window: the label and one
 * short hint on the left, the control in a fixed column on the right; stacked
 * on phones. Rows sit in a `divide-y` parent for the hairline between them.
 * Used by Settings and the job pages.
 *
 * `labelFor` labels a native input; `labelId` is for a control that points at
 * its label itself (`PremiumSelect`'s `labelledBy`, a `role="group"`). `wide`
 * lets the control column grow to its content (the colour swatches, a pair of
 * inputs, a lone button) instead of the fixed width. `error` renders under the
 * control with `errorId`, which the control's `aria-describedby` names.
 */
export function SettingRow({ label, labelFor, labelId, hint, hintId, error, errorId, wide = false, children }: {
  label: string;
  labelFor?: string;
  labelId?: string;
  hint?: ReactNode;
  hintId?: string;
  error?: string;
  errorId?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  return <div className={cn("grid gap-3 py-5 first:pt-0 last:pb-0 sm:items-center sm:gap-8", wide ? "sm:grid-cols-[minmax(0,1fr)_auto]" : "sm:grid-cols-[minmax(0,1fr)_16.5rem]")}>
    <div className="min-w-0">
      {labelFor ? <label htmlFor={labelFor} className="text-sm font-semibold">{label}</label> : <p id={labelId} className="text-sm font-semibold">{label}</p>}
      {hint && <p id={hintId} className="mt-1 text-[13px] leading-5 text-[var(--muted-foreground)]">{hint}</p>}
    </div>
    <div className="min-w-0">
      {children}
      {errorId && <FieldError id={errorId} message={error} />}
    </div>
  </div>;
}

/** A unit or currency mark inside a field, e.g. "hours" or "%". The input needs room for it (`pr-*` / `pl-*`). */
export function FieldAffix({ side = "right", children }: { side?: "left" | "right"; children: ReactNode }) {
  return <span aria-hidden="true" className={cn("pointer-events-none absolute inset-y-0 flex items-center text-sm text-[var(--muted-foreground)]", side === "right" ? "right-4" : "left-3.5")}>{children}</span>;
}
