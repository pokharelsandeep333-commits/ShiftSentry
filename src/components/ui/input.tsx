import * as React from "react";
import { cn } from "@/lib/utils";

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn("field-control flex text-sm placeholder:text-[var(--muted-foreground)]", className)} {...props} />;
}
