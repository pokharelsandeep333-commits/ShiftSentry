import { ViewTransition } from "react";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The add/edit page while it loads, shaped like it (job chips, the week of
 * date tiles, the day track, the typed times, the footer): without its own
 * skeleton the shift log's would stand in, and the page would change shape on
 * arrival.
 */
export function ShiftEditorSkeleton({ label }: { label: string }) {
  // The skeleton dissolves as the page arrives (`.skeleton-out`, globals.css).
  return <ViewTransition exit="skeleton-out" default="none"><div aria-busy="true" aria-live="polite" className="max-w-[72rem]">
    <span className="sr-only">{label}</span>
    <Skeleton className="mb-3 h-6 w-20 rounded-lg" />
    <Skeleton className="h-10 w-48 rounded-2xl" />
    <Skeleton className="mb-8 mt-3 h-4 w-[26rem] max-w-full" />
    <div className="overflow-hidden rounded-2xl border bg-[var(--card)]">
      <div className="grid gap-3 p-4 sm:p-6"><Skeleton className="h-4 w-12" /><div className="flex flex-wrap gap-2">{[44, 28, 40].map((width, chip) => <Skeleton key={chip} className="h-11 rounded-full" style={{ width: `${width * 4}px` }} />)}</div></div>
      <div className="grid gap-4 border-t p-4 sm:p-6">
        <Skeleton className="h-4 w-14" />
        <div className="grid grid-cols-7 gap-1.5">{Array.from({ length: 7 }, (_, day) => <Skeleton key={day} className="h-[58px] rounded-[14px]" />)}</div>
        <Skeleton className="h-16 rounded-[14px] sm:h-16" />
        <div className="grid gap-3 border-t pt-4 sm:grid-cols-4"><Skeleton className="h-11 rounded-xl" /><Skeleton className="h-11 rounded-xl" /><Skeleton className="h-11 rounded-xl" /><Skeleton className="h-11 rounded-xl" /></div>
      </div>
      <div className="grid gap-3 border-t p-4 sm:p-6"><Skeleton className="h-4 w-24" /><Skeleton className="h-10 w-80 max-w-full rounded-full" /></div>
      <div className="flex flex-wrap items-center justify-between gap-4 border-t p-4 sm:px-6"><div className="grid gap-2"><Skeleton className="h-7 w-28" /><Skeleton className="h-3.5 w-56" /></div><div className="flex gap-2"><Skeleton className="h-11 w-24 rounded-full" /><Skeleton className="h-11 w-40 rounded-full" /></div></div>
    </div>
  </div></ViewTransition>;
}
