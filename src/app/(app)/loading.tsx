import { ViewTransition } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import styles from "@/components/dashboard/dashboard.module.css";

/** Matches the cap card, the week panel and up-next rail, the earnings row and recent shifts. */
export default function Loading() {
  return <ViewTransition exit="skeleton-out" default="none"><div className={styles.root} aria-busy="true" aria-live="polite">
    <span className="sr-only">Loading</span>
    <div className="mb-5"><Skeleton className="h-8 w-72 max-w-full" /><Skeleton className="mt-2 h-4 w-44" /></div>
    <div className="premium-card mb-5 min-w-0 rounded-3xl border p-6">
      <div className="flex flex-wrap justify-between gap-3"><Skeleton className="h-5 w-36" /><Skeleton className="h-8 w-28 rounded-full" /></div>
      <Skeleton className="mt-5 h-14 w-52 max-w-full" /><Skeleton className="mt-5 h-2.5 w-full rounded-full" /><Skeleton className="mt-3 h-4 w-40" />
    </div>
    <div className={styles.topGrid}>
      <div className="premium-card min-w-0 border p-5 sm:p-6">
        <div className="flex flex-wrap justify-between gap-3"><Skeleton className="h-10 w-32" /><Skeleton className="h-10 w-40" /></div>
        <div className="mt-5 grid grid-cols-7 gap-1">{[0, 1, 2, 3, 4, 5, 6].map((day) => <Skeleton key={day} className="h-32 w-full rounded-xl" />)}</div>
        <div className="mt-4 border-t pt-4"><Skeleton className="h-4 w-20" /><Skeleton className="mt-3 h-10 w-full" /></div>
      </div>
      <div className="premium-card min-w-0 border p-5 sm:p-6">
        <Skeleton className="h-5 w-24" /><Skeleton className="mt-4 h-28 w-full rounded-2xl" />
        <div className="mt-5 border-t pt-4"><Skeleton className="h-5 w-20" /><Skeleton className="mt-3 h-10 w-full" /></div>
      </div>
    </div>
    <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {[0, 1].map((card) => <div key={card} className="premium-card min-w-0 border p-5 sm:p-6"><Skeleton className="h-5 w-32" /><Skeleton className="mt-6 h-12 w-48 max-w-full" /><Skeleton className="mt-6 h-48 w-full" /></div>)}
    </div>
    <div className="premium-card mt-5 border p-5"><Skeleton className="h-5 w-32" /><div className="mt-4 grid gap-4">{[0, 1, 2].map((row) => <Skeleton key={row} className="h-12 w-full" />)}</div></div>
  </div></ViewTransition>;
}
