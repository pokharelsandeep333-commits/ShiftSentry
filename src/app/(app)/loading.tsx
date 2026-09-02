import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * Fallback for the overview, and for any route in this group without a closer
 * boundary. Its real job is to exist: without a `loading.tsx` a navigation to a
 * `force-dynamic` page paints nothing until the server responds, and Next has
 * no static shell to prefetch either.
 */
export default function Loading() {
  return <div aria-busy="true" aria-live="polite">
    <span className="sr-only">Loading</span>
    <div className="mb-7 sm:mb-8">
      <Skeleton className="mb-2 h-3 w-32" />
      <Skeleton className="h-10 w-72 max-w-full rounded-2xl" />
      <Skeleton className="mt-3 h-4 w-96 max-w-full" />
    </div>

    <Card className="mb-6">
      <CardContent className="grid gap-6 p-5 sm:p-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
        <div>
          <Skeleton className="h-4 w-40" />
          <Skeleton className="mt-4 h-14 w-56 rounded-2xl" />
          <Skeleton className="mt-4 h-2.5 w-full rounded-full" />
          <div className="mt-3 flex justify-between gap-4"><Skeleton className="h-3 w-24" /><Skeleton className="h-3 w-24" /></div>
        </div>
        <div className="grid grid-cols-2 gap-3 lg:min-w-64">
          <Skeleton className="h-24 rounded-2xl" />
          <Skeleton className="h-24 rounded-2xl" />
        </div>
      </CardContent>
    </Card>

    <div className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
      {[0, 1].map((key) => <Card key={key}>
        <CardHeader><Skeleton className="h-5 w-48" /><Skeleton className="mt-2 h-3.5 w-64 max-w-full" /></CardHeader>
        <CardContent className="space-y-3">{[0, 1, 2, 3].map((row) => <Skeleton key={row} className="h-11 w-full rounded-xl" />)}</CardContent>
      </Card>)}
    </div>
  </div>;
}
