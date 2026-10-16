import { ViewTransition } from "react";
import { JobSectionSkeleton } from "@/components/jobs/job-form-skeleton";
import { Skeleton } from "@/components/ui/skeleton";

/** The back link, heading and the one form card of the new-job page. */
export default function Loading() {
  // The skeleton dissolves as the page arrives (`.skeleton-out`, globals.css).
  return <ViewTransition exit="skeleton-out" default="none"><div aria-busy="true" aria-live="polite">
    <span className="sr-only">Loading</span>
    <Skeleton className="mb-3 h-5 w-16" />
    <div className="mb-8"><Skeleton className="h-10 w-48 rounded-2xl" /><Skeleton className="mt-3 h-4 w-[28rem] max-w-full" /></div>
    <div className="max-w-3xl"><JobSectionSkeleton fields={5} /></div>
  </div></ViewTransition>;
}
