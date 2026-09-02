import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** A single narrow form card, matching the settings page. */
export default function Loading() {
  return <div aria-busy="true" aria-live="polite">
    <span className="sr-only">Loading settings</span>
    <div className="mb-8">
      <Skeleton className="mb-2 h-3 w-24" />
      <Skeleton className="h-10 w-44 rounded-2xl" />
      <Skeleton className="mt-3 h-4 w-[30rem] max-w-full" />
    </div>

    <Card className="max-w-2xl">
      <CardHeader><Skeleton className="h-5 w-36" /></CardHeader>
      <CardContent className="grid gap-5">
        {[0, 1, 2, 3].map((field) => <div key={field}><Skeleton className="mb-2 h-3.5 w-32" /><Skeleton className="h-11 w-full rounded-xl" /></div>)}
        <Skeleton className="h-11 w-36 rounded-xl" />
      </CardContent>
    </Card>
  </div>;
}
