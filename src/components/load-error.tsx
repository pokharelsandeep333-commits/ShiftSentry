import { TriangleAlert } from "lucide-react";

/**
 * Shown when a page's own data could not be loaded. An empty list there would
 * read as "you have no jobs" or "no shifts", which is false and alarming; this
 * says what actually happened. Nothing about the failure is shown to the user.
 */
export function LoadError({ what }: { what: string }) {
  return <div role="alert" className="flex items-start gap-3 rounded-2xl border border-[color-mix(in_srgb,var(--danger)_30%,var(--border))] bg-[color-mix(in_srgb,var(--danger)_8%,var(--card))] p-5 text-sm leading-6">
    <TriangleAlert className="mt-0.5 size-5 shrink-0 text-[var(--danger)]" />
    <p><b className="font-semibold">Couldn&apos;t load your {what}.</b> Nothing has been changed or deleted. Refresh the page to try again.</p>
  </div>;
}
