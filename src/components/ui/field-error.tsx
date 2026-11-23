import type { ReactNode } from "react";

/**
 * The accessibility wiring for one field: invalid while it has a message, and
 * described by its hint and then its message. Spread onto the input.
 */
export function fieldA11y(errorId: string, error: string | undefined, hintId?: string) {
  const describedBy = [hintId, error ? errorId : undefined].filter(Boolean).join(" ");
  return { "aria-invalid": error ? true : undefined, "aria-describedby": describedBy || undefined } as const;
}

/**
 * A server message under the field it is about. Not an alert: a form can come
 * back with several, and `useActionForm` moves focus to the first invalid
 * field, which then reads its message through `aria-describedby`.
 */
export function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return <p id={id} className="mt-1.5 text-xs font-medium leading-5 text-[var(--danger-ink)]">{message}</p>;
}

/**
 * The one message no single field owns (a lost row, a failed write), shown
 * above the form's buttons.
 */
export function FormError({ message }: { message?: ReactNode }) {
  if (!message) return null;
  return <p role="alert" className="rounded-xl border border-[color-mix(in_srgb,var(--danger)_35%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_10%,transparent)] px-3 py-2.5 text-sm font-medium text-[var(--danger-ink)]">{message}</p>;
}
