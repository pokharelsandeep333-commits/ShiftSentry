import Link from "next/link";
import { ArrowLeft } from "lucide-react";

/** The way back from a job's page or the new-job page to the list. */
export function BackToJobs() {
  return <Link href="/jobs" className="-ml-2 mb-3 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2 text-sm font-semibold text-[var(--muted-foreground)] outline-none transition-colors hover:text-[var(--foreground)] focus-visible:ring-4 focus-visible:ring-[var(--primary-soft)] sm:min-h-9">
    <ArrowLeft className="size-4" aria-hidden="true" />Jobs
  </Link>;
}
