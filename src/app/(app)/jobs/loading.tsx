import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** Two-column job list and the add-a-job form beside it. */
export default function Loading() {
  return <div aria-busy="true" aria-live="polite">
    <span className="sr-only">Loading jobs</span>
    <div className="mb-8">
      <Skeleton className="mb-2 h-3 w-16" />
      <Skeleton className="h-10 w-80 max-w-full rounded-2xl" />
      <Skeleton className="mt-3 h-4 w-[32rem] max-w-full" />
    </div>

    <div className="grid gap-6 lg:grid-cols-[1.15fr_0.85fr]">
      <Card>
        <CardHeader><Skeleton className="h-5 w-40" /></CardHeader>
        <CardContent className="space-y-3">{[0, 1, 2].map((job) => <div key={job} className="rounded-2xl border p-4">
          <div className="flex items-start gap-3">
            <Skeleton className="mt-1.5 size-3 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1"><Skeleton className="h-6 w-48 max-w-full" /><Skeleton className="mt-2 h-4 w-72 max-w-full" /></div>
            <Skeleton className="h-8 w-20 shrink-0 rounded-xl" />
          </div>
          <div className="mt-4 border-t pt-4"><Skeleton className="h-5 w-64 max-w-full" /></div>
        </div>)}</CardContent>
      </Card>
      <Card className="h-fit">
        <CardHeader><Skeleton className="h-5 w-28" /></CardHeader>
        <CardContent className="grid gap-4">
          {[0, 1, 2, 3].map((field) => <div key={field}><Skeleton className="mb-2 h-3.5 w-28" /><Skeleton className="h-11 w-full rounded-xl" /></div>)}
          <Skeleton className="h-11 w-full rounded-xl" />
        </CardContent>
      </Card>
    </div>
  </div>;
}
