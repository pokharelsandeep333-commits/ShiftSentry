import * as React from "react";
import { cn } from "@/lib/utils";

/**
 * Placeholder block for a `loading.tsx` boundary. Purely decorative -- the
 * surrounding boundary is what screen readers announce -- so it is hidden from
 * the accessibility tree rather than read out as empty content.
 */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div aria-hidden className={cn("skeleton", className)} {...props} />;
}
