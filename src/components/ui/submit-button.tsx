"use client";

import { useFormStatus } from "react-dom";
import { Button, type ButtonProps } from "@/components/ui/button";

type SubmitButtonProps = Omit<ButtonProps, "type" | "children"> & {
  label: string;
  /** Shown while the action is in flight. Defaults to the label plus an ellipsis. */
  pendingLabel?: string;
};

/**
 * A submit button that visibly registers the press.
 *
 * For a form whose action navigates, the gap between tapping and the page
 * changing is a network round trip -- and on a phone it is long enough that a
 * button which does not change looks broken, so people tap it again. Next.js
 * serialises Server Actions, so those extra taps queue up behind the first and
 * make it worse.
 *
 * `useFormStatus` only reports on the form this button is inside, which is why
 * this has to be its own client component rather than a prop on the page.
 */
export function SubmitButton({ label, pendingLabel, ...props }: SubmitButtonProps) {
  const { pending } = useFormStatus();

  return <Button type="submit" disabled={pending} {...props}>
    {pending ? pendingLabel ?? `${label}…` : label}
  </Button>;
}
