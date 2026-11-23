import { ViewTransition } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { SETTINGS_PANE_CLASS, SETTINGS_WINDOW_CLASS } from "@/components/settings/window-frame";

/** The Settings window's outline while the page loads: title bar, sidebar, first pane. */
export default function Loading() {
  // The skeleton dissolves as the page arrives (`.skeleton-out`, globals.css).
  return <ViewTransition exit="skeleton-out" default="none"><div aria-busy="true" aria-live="polite" className="fixed inset-0 z-[60] sm:flex sm:items-center sm:justify-center">
    <span className="sr-only">Loading settings</span>
    <div className="settings-backdrop absolute inset-0" aria-hidden="true" />
    <div className={SETTINGS_WINDOW_CLASS}>
      <div className="flex h-16 shrink-0 items-center justify-between border-b px-5 sm:px-6"><Skeleton className="h-5 w-24" /><Skeleton className="size-10 rounded-full" /></div>
      <div className="flex min-h-0 flex-1 flex-col sm:flex-row">
        <div className="flex gap-2 border-b px-3 py-2.5 sm:w-60 sm:flex-col sm:border-b-0 sm:border-r sm:bg-[var(--surface-subtle)] sm:p-3">
          {[0, 1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-10 w-32 shrink-0 rounded-xl sm:w-full" />)}
        </div>
        <div className="flex-1 px-5 py-6 sm:px-8 sm:py-7">
          <div className={`${SETTINGS_PANE_CLASS} grid gap-5`}>
            <Skeleton className="h-6 w-48" /><Skeleton className="h-4 w-80 max-w-full" />
            {[0, 1, 2, 3].map((field) => <div key={field}><Skeleton className="mb-2 h-3.5 w-32" /><Skeleton className="h-11 w-full rounded-xl" /></div>)}
          </div>
        </div>
      </div>
    </div>
  </div></ViewTransition>;
}
