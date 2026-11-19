import { ViewTransition } from "react";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * The add/edit page while it loads, shaped like it (job chips, the week of
 * date tiles, the day track, the typed times, the footer): without its own
 * skeleton the shift log's would stand in, and the page would change shape on
 * arrival.
 */
export function ShiftEditorSkeleton({ label, mode = "edit" }: { label: string; mode?: "create" | "edit" }) {
  // The skeleton dissolves as the page arrives (`.skeleton-out`, globals.css).
  return <ViewTransition exit="skeleton-out" default="none"><div aria-busy="true" aria-live="polite" className="max-w-[72rem]">
    <span className="sr-only">{label}</span>
    <Skeleton className="mb-3 h-6 w-20 rounded-lg" />
    <Skeleton className="h-10 w-48 rounded-2xl" />
    <Skeleton className="mb-8 mt-3 h-4 w-[26rem] max-w-full" />
    <div className="shift-log shift-page-card"><div className="shift-composer" data-mode={mode}>
      <div className="composer-section composer-job grid content-start gap-3"><Skeleton className="h-4 w-12" /><div className="flex flex-wrap gap-2"><Skeleton className="h-11 w-28 rounded-full" /><Skeleton className="h-11 w-24 rounded-full" /></div></div>
      <div className="composer-section composer-when grid content-start gap-4">
        <Skeleton className="h-4 w-14" />
        <div className="grid grid-cols-7 gap-1.5">{Array.from({ length: 7 }, (_, day) => <Skeleton key={day} className="h-[58px] rounded-[14px]" />)}</div>
        <Skeleton className="h-16 rounded-[14px] sm:h-16" />
        <div className="composer-exact"><div className="shift-schedule-fields">{["start", "end"].map((field) => <div key={field} className="shift-schedule-row"><Skeleton className="h-11" /><Skeleton className="h-11" /></div>)}</div></div>
      </div>
      {mode === "create" && <div className="composer-section composer-repeat grid content-start gap-3"><Skeleton className="h-4 w-24" /><Skeleton className="h-16 w-full" /></div>}
      <div className="composer-section composer-note"><Skeleton className="h-5 w-20" /></div>
      <div className="composer-footer"><div className="grid gap-2"><Skeleton className="h-7 w-28" /><Skeleton className="h-3.5 w-52" /></div><div className="composer-actions"><Skeleton className="h-11 w-20 rounded-full" /><Skeleton className="h-11 w-36 rounded-full" /></div></div>
    </div></div>
  </div></ViewTransition>;
}
