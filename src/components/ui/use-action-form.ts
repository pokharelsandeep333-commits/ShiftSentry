"use client";

import { startTransition, useEffect, useRef, type FormEvent } from "react";
import type { FieldErrors } from "@/lib/form-state";

/**
 * Submits a form through its `useActionState` action while keeping what was
 * typed. React resets a form whose `action` is a function once the action
 * returns, so a rejected rate came back as the old value with a message under
 * it. Dispatching from `onSubmit` skips that reset; keep `action` on the form
 * too, so it still posts before hydration.
 *
 * Returns the `onSubmit` handler. When the action returns field errors, focus
 * moves to the first invalid field, which reads its message through
 * `aria-describedby`.
 */
export function useActionForm(dispatch: (formData: FormData) => void, state: { fieldErrors?: FieldErrors }) {
  // The form last submitted, kept from the event rather than passed in as a ref.
  const submitted = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    if (!state.fieldErrors || !Object.keys(state.fieldErrors).length) return;
    submitted.current?.querySelector<HTMLElement>("[aria-invalid='true']")?.focus();
  }, [state]);

  return function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    submitted.current = form;
    const formData = new FormData(form, (event.nativeEvent as SubmitEvent).submitter);
    startTransition(() => dispatch(formData));
  };
}
