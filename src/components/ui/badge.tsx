import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva("inline-flex w-fit items-center rounded-full px-2.5 py-1 text-xs font-semibold", {
  variants: {
    variant: {
      default: "bg-[color-mix(in_srgb,var(--primary)_16%,transparent)] text-[var(--primary)]",
      success: "bg-[color-mix(in_srgb,var(--success)_16%,transparent)] text-[var(--success)]",
      warning: "bg-[color-mix(in_srgb,var(--warning)_18%,transparent)] text-[var(--warning)]",
      danger: "bg-[color-mix(in_srgb,var(--danger)_16%,transparent)] text-[var(--danger)]",
      muted: "bg-[var(--muted)] text-[var(--muted-foreground)]",
    },
    defaultVariants: { variant: "default" },
  },
});
export function Badge({ className, variant, ...props }: React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof badgeVariants>) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
