import { ViewTransition } from "react";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The add/edit page while it loads, shaped like it: without its own skeleton
 * the shift log's would stand in, and the page would change shape on arrival.
 */
export function ShiftEditorSkeleton({ label }: { label: string }) {
  // The skeleton dissolves as the page arrives (`.skeleton-out`, globals.css).
  return <ViewTransition exit="skeleton-out" default="none"><div aria-busy="true" aria-live="polite" className="max-w-[64rem]">
    <span className="sr-only">{label}</span>
    <Skeleton className="mb-3 h-6 w-20 rounded-lg" />
    <Skeleton className="h-10 w-48 rounded-2xl" />
    <Skeleton className="mb-8 mt-3 h-4 w-[26rem] max-w-full" />
    <div className="rounded-3xl border bg-[var(--card)] p-6">
      <div className="grid gap-6 md:grid-cols-[1.1fr_1fr] md:gap-8">
        <div className="grid content-start gap-5">
          <Skeleton className="h-11 rounded-xl" />
          <div className="grid grid-cols-2 gap-3"><Skeleton className="h-11 rounded-xl" /><Skeleton className="h-11 rounded-xl" /></div>
          <div className="grid grid-cols-2 gap-3"><Skeleton className="h-11 rounded-xl" /><Skeleton className="h-11 rounded-xl" /></div>
          <Skeleton className="h-11 rounded-xl" />
        </div>
        <Skeleton className="h-44 rounded-2xl" />
      </div>
    </div>
  </div></ViewTransition>;
}
