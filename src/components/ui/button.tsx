import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold tracking-[-0.01em] transition-[transform,box-shadow,background-color,border-color,color] duration-300 ease-out disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[var(--primary-soft)] active:translate-y-px",
  {
    variants: {
      variant: {
        default: "bg-[var(--primary)] text-[var(--primary-foreground)] shadow-lg shadow-[var(--primary-glow)] hover:-translate-y-0.5 hover:brightness-105 hover:shadow-xl hover:shadow-[var(--primary-glow)]",
        secondary: "bg-[var(--surface-subtle)] text-[var(--foreground)] shadow-sm hover:-translate-y-0.5 hover:bg-[var(--muted)]",
        outline: "border bg-[var(--card)]/45 shadow-sm hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--primary)_35%,var(--border))] hover:bg-[var(--primary-soft)]",
        ghost: "hover:bg-[var(--primary-soft)] hover:text-[var(--primary)]",
        danger: "bg-[var(--danger)] text-white shadow-lg shadow-[color-mix(in_srgb,var(--danger)_22%,transparent)] hover:-translate-y-0.5 hover:brightness-105",
      },
      size: { default: "h-11 px-4 py-2", sm: "h-8 rounded-lg px-3 text-xs", lg: "h-12 px-6", icon: "size-10" },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return <button className={cn(buttonVariants({ variant, size }), className)} {...props} />;
}
