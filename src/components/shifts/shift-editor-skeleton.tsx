import { ViewTransition } from "react";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The add/edit page while it loads, shaped like it: without its own skeleton
 * the shift log's would stand in, and the page would change shape on arrival.
 */
export function ShiftEditorSkeleton({ label }: { label: string }) {
  // The skeleton dissolves as the page arrives (`.skeleton-out`, globals.css).
  return <ViewTransition exit="skeleton-out" default="none"><div aria-busy="true" aria-live="polite" className="max-w-[72rem]">
    <span className="sr-only">{label}</span>
    <Skeleton className="mb-3 h-6 w-20 rounded-lg" />
    <Skeleton className="h-10 w-48 rounded-2xl" />
    <Skeleton className="mb-8 mt-3 h-4 w-[26rem] max-w-full" />
    <div className="overflow-hidden rounded-2xl border bg-[var(--card)]">
      <div className="grid lg:grid-cols-[1fr_360px]">
        <div className="grid content-start">
          <div className="grid gap-3 p-6"><Skeleton className="h-4 w-12" /><div className="flex flex-wrap gap-2">{[44, 28, 40].map((width, chip) => <Skeleton key={chip} className="h-11 rounded-full" style={{ width: `${width * 4}px` }} />)}</div></div>
          <div className="grid gap-3 border-t p-6"><Skeleton className="h-4 w-14" /><div className="grid grid-cols-2 gap-3"><Skeleton className="h-11 rounded-xl" /><Skeleton className="h-11 rounded-xl" /></div><div className="grid grid-cols-2 gap-3"><Skeleton className="h-11 rounded-xl" /><Skeleton className="h-11 rounded-xl" /></div></div>
          <div className="grid gap-3 border-t p-6"><Skeleton className="h-4 w-24" /><Skeleton className="h-10 w-80 max-w-full rounded-full" /></div>
        </div>
        <div className="grid content-start gap-3 border-t p-6 lg:border-l lg:border-t-0"><Skeleton className="h-28 rounded-2xl" /><Skeleton className="h-32 rounded-2xl" /></div>
      </div>
    </div>
  </div></ViewTransition>;
}
