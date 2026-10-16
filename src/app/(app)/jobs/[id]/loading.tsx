import { ViewTransition } from "react";
import { JobSectionSkeleton } from "@/components/jobs/job-form-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/** The job's heading, its stat row and the first two section cards. */
export default function Loading() {
  // The skeleton dissolves as the page arrives (`.skeleton-out`, globals.css).
  return <ViewTransition exit="skeleton-out" default="none"><div aria-busy="true" aria-live="polite">
    <span className="sr-only">Loading job</span>
    <Skeleton className="mb-3 h-5 w-16" />
    <div className="mb-6 flex items-center gap-4"><Skeleton className="size-12 shrink-0 rounded-2xl" /><Skeleton className="h-10 w-56 rounded-2xl" /></div>
    <div className="mb-6 grid max-w-3xl grid-cols-3 gap-5">{[0, 1, 2].map((stat) => <div key={stat}><Skeleton className="h-3 w-20" /><Skeleton className="mt-2 h-5 w-16" /></div>)}</div>
    <div className="grid max-w-3xl gap-6"><JobSectionSkeleton fields={5} /><JobSectionSkeleton fields={2} /></div>
  </div></ViewTransition>;
}
