import { ViewTransition } from "react";
import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the week ledger (header, strip, day tiles) so the list does not jump when it arrives. */
export default function Loading() {
  // The skeleton dissolves as the page arrives (`.skeleton-out`, globals.css).
  return <ViewTransition exit="skeleton-out" default="none"><div aria-busy="true" aria-live="polite">
    <span className="sr-only">Loading shifts</span>
    <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <Skeleton className="h-10 w-40 rounded-2xl" />
        <Skeleton className="mt-3 h-4 w-[28rem] max-w-full" />
      </div>
    </div>
    <div className="mb-5 flex flex-wrap gap-2"><Skeleton className="h-9 w-56 rounded-full" /></div>

    <div className="grid gap-3">{[0, 1, 2, 3].map((week) => <div key={week} className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
      <div className="flex min-h-[76px] items-center gap-5 px-5">
        <div className="flex-1"><Skeleton className="h-5 w-32" /><Skeleton className="mt-2 h-3.5 w-24" /></div>
        <div className="hidden gap-[5px] sm:flex">{Array.from({ length: 7 }, (_, day) => <Skeleton key={day} className="h-[30px] w-2.5 rounded" />)}</div>
        <Skeleton className="h-5 w-16" />
        <Skeleton className="h-5 w-20" />
      </div>
      {week === 0 && <div className="border-t border-[var(--border)] px-5 py-3">{[0, 1].map((row) => <div key={row} className="flex items-center gap-4 py-2.5">
        <Skeleton className="h-[52px] w-12 shrink-0 rounded-xl" />
        <div className="min-w-0 flex-1"><Skeleton className="h-4 w-48 max-w-full" /><Skeleton className="mt-2 h-3.5 w-36" /></div>
        <Skeleton className="h-4 w-14 shrink-0" />
        <Skeleton className="h-4 w-16 shrink-0" />
      </div>)}</div>}
    </div>)}</div>
  </div></ViewTransition>;
}
