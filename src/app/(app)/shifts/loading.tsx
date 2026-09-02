import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Mirrors the week-group accordion so the list does not jump when it arrives. */
export default function Loading() {
  return <div aria-busy="true" aria-live="polite">
    <span className="sr-only">Loading shifts</span>
    <div className="mb-8 flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
      <div>
        <Skeleton className="mb-2 h-3 w-24" />
        <Skeleton className="h-10 w-56 rounded-2xl" />
        <Skeleton className="mt-3 h-4 w-[28rem] max-w-full" />
      </div>
      <Skeleton className="h-10 w-32 shrink-0 rounded-xl" />
    </div>

    <div className="space-y-3">{[0, 1, 2, 3].map((week) => <Card key={week}>
      <CardContent className="p-2 sm:p-3">
        <div className="flex items-center gap-3 p-3">
          <Skeleton className="size-4 shrink-0 rounded-md" />
          <Skeleton className="h-5 w-56 max-w-full flex-1" />
          <Skeleton className="h-8 w-20 shrink-0 rounded-xl" />
          <Skeleton className="h-5 w-16 shrink-0" />
        </div>
        {week === 0 && <div className="mt-1 space-y-1">{[0, 1, 2].map((row) => <div key={row} className="flex items-center gap-4 p-3.5 sm:p-4">
          <Skeleton className="size-10 shrink-0 rounded-xl" />
          <div className="min-w-48 flex-1"><Skeleton className="h-4 w-40" /><Skeleton className="mt-2 h-3.5 w-56 max-w-full" /></div>
          <Skeleton className="h-8 w-20 shrink-0 rounded-xl" />
          <Skeleton className="h-8 w-24 shrink-0 rounded-xl" />
        </div>)}</div>}
      </CardContent>
    </Card>)}</div>
  </div>;
}
