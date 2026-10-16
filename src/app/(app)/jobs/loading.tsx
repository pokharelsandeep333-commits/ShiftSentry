import { ViewTransition } from "react";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** A grid of job cards, matching the jobs list. */
export default function Loading() {
  // The skeleton dissolves as the page arrives (`.skeleton-out`, globals.css).
  return <ViewTransition exit="skeleton-out" default="none"><div aria-busy="true" aria-live="polite">
    <span className="sr-only">Loading jobs</span>
    <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div><Skeleton className="h-10 w-32 rounded-2xl" /><Skeleton className="mt-3 h-4 w-[30rem] max-w-full" /></div>
      <Skeleton className="h-11 w-28 shrink-0 rounded-xl" />
    </div>
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {[0, 1, 2].map((job) => <Card key={job} className="p-5">
        <div className="flex items-start gap-3.5"><Skeleton className="size-10 shrink-0 rounded-xl" /><div className="min-w-0 flex-1"><Skeleton className="h-6 w-40 max-w-full" /><Skeleton className="mt-2 h-4 w-52 max-w-full" /></div></div>
        <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 border-t pt-4">{[0, 1, 2].map((stat) => <div key={stat}><Skeleton className="h-3 w-20" /><Skeleton className="mt-1.5 h-4 w-24" /></div>)}</div>
        <Skeleton className="mt-4 h-6 w-20 rounded-full" />
      </Card>)}
    </div>
  </div></ViewTransition>;
}
