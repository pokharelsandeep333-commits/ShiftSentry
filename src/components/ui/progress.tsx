import { cn } from "@/lib/utils";

export function Progress({ value, className, indicatorClassName }: { value: number; className?: string; indicatorClassName?: string }) {
  return <div className={cn("h-2 w-full overflow-hidden rounded-full bg-[var(--muted)]", className)}>
    <div className={cn("h-full rounded-full bg-[var(--primary)] transition-all", indicatorClassName)} style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
  </div>;
}
