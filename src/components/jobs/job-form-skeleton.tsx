import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

/** One section card of form fields, for the new-job and job pages' loading states. */
export function JobSectionSkeleton({ fields }: { fields: number }) {
  return <Card>
    <div className="flex items-start gap-3.5 p-5 sm:p-6">
      <Skeleton className="size-10 shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1"><Skeleton className="h-5 w-36" /><Skeleton className="mt-2 h-4 w-80 max-w-full" /></div>
    </div>
    <CardContent className="grid gap-5">
      {Array.from({ length: fields }, (_, field) => <div key={field}><Skeleton className="mb-2 h-3.5 w-32" /><Skeleton className="h-11 w-full rounded-xl" /></div>)}
    </CardContent>
  </Card>;
}
