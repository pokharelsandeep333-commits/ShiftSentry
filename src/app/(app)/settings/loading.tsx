import { ViewTransition } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** The section nav beside the first two section cards, matching the settings page. */
export default function Loading() {
  // The skeleton dissolves as the page arrives (`.skeleton-out`, globals.css).
  return <ViewTransition exit="skeleton-out" default="none"><div aria-busy="true" aria-live="polite">
    <span className="sr-only">Loading settings</span>
    <div className="mb-8">
      <Skeleton className="h-10 w-44 rounded-2xl" />
      <Skeleton className="mt-3 h-4 w-[30rem] max-w-full" />
    </div>

    <div className="grid gap-6 lg:grid-cols-[13.5rem_minmax(0,1fr)] lg:gap-8 xl:gap-10">
      <div className="flex gap-2 overflow-hidden lg:flex-col lg:gap-1">
        {[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-11 w-36 shrink-0 rounded-xl lg:h-10 lg:w-full" />)}
      </div>
      <div className="grid min-w-0 max-w-3xl gap-6">
        {[4, 2].map((fields, card) => <Card key={card}>
          <div className="flex items-start gap-3.5 p-5 sm:p-6">
            <Skeleton className="size-10 shrink-0 rounded-xl" />
            <div className="min-w-0 flex-1"><Skeleton className="h-5 w-40" /><Skeleton className="mt-2 h-4 w-80 max-w-full" /></div>
          </div>
          <CardContent className="grid gap-5">
            {Array.from({ length: fields }, (_, field) => <div key={field}><Skeleton className="mb-2 h-3.5 w-32" /><Skeleton className="h-11 w-full rounded-xl" /></div>)}
          </CardContent>
        </Card>)}
      </div>
    </div>
  </div></ViewTransition>;
}
