import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { LoaderCircle } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Shared with `Link`. A link that looks like a button must still *be* a link:
 * wrapping a <button> in an <a> is invalid -- an anchor may not contain
 * interactive content -- and it gives assistive tech two nested controls where
 * the page has one, with only the inner button reachable by keyboard.
 */
export const buttonVariants = cva(
  // `press` (globals.css) is the transition: the hover lift eases, a press
  // sinks, and letting go springs back.
  "press inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold tracking-[-0.01em] disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--primary-soft)]",
  {
    variants: {
      variant: {
        default: "bg-[var(--primary)] text-[var(--primary-foreground)] shadow-lg shadow-[var(--primary-glow)] hover:-translate-y-0.5 hover:brightness-105 hover:shadow-xl hover:shadow-[var(--primary-glow)]",
        secondary: "bg-[var(--surface-subtle)] text-[var(--foreground)] shadow-sm hover:-translate-y-0.5 hover:bg-[var(--muted)]",
        outline: "border bg-[var(--card)]/45 shadow-sm hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--primary)_35%,var(--border))] hover:bg-[var(--primary-soft)]",
        ghost: "hover:bg-[var(--primary-soft)] hover:text-[var(--primary)]",
        danger: "bg-[var(--danger)] text-white shadow-lg shadow-[color-mix(in_srgb,var(--danger)_22%,transparent)] hover:-translate-y-0.5 hover:brightness-105",
      },
      // `sm` and `icon` grow to 44px below the sm breakpoint and shrink back
      // above it, the same trade the shell already makes with `size-11 sm:size-10`
      // on its header controls: a 32px control is comfortable with a mouse and
      // an awkward target for a thumb. `default` and `lg` already clear 44.
      size: { default: "h-11 px-4 py-2", sm: "h-11 rounded-lg px-3 text-xs sm:h-8", lg: "h-12 px-6", icon: "size-11 sm:size-10" },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(function Button({ className, variant, size, ...props }, ref) {
  return <button ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});

Button.displayName = "Button";

/**
 * A button label that turns into a spinner and a busy label while its form is
 * saving. Both labels sit in one grid cell, so the button is always as wide as
 * the wider of the two: it never changes size under the finger, and the row
 * it sits in never reflows. The resting label slides up and out as the busy
 * one slides in (`.pending-label` in globals.css). The hidden label is
 * aria-hidden, so the button's name is always the one on show.
 */
export function PendingLabel({ pending, label, pendingLabel }: { pending: boolean; label: React.ReactNode; pendingLabel: React.ReactNode }) {
  return <span className="pending-label" data-pending={pending || undefined}>
    <span className="pending-rest" aria-hidden={pending || undefined}>{label}</span>
    <span className="pending-busy" aria-hidden={!pending || undefined}><LoaderCircle className="size-4 animate-spin" />{pendingLabel}</span>
  </span>;
}
