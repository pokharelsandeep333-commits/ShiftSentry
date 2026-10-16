"use client";

import { useSyncExternalStore } from "react";
import { Info, TriangleAlert, X } from "lucide-react";
import { createLocalPreference } from "@/lib/local-preference";
import { cn } from "@/lib/utils";

/** The id of the announcement this device dismissed. A new announcement has a new id, so it shows again. */
const dismissedAnnouncement = createLocalPreference<string | null>("shiftsentry:dismissed-announcement", null, (parsed) => (typeof parsed === "string" ? parsed : null));

/**
 * The site-wide notice an admin posts, at the top of every signed-in page.
 *
 * Drawn only after hydration: the server cannot read whether this device
 * dismissed it, and drawing it then removing it would flash a banner at the
 * people who already closed it. Its text is rendered as text; nothing in it is
 * parsed as markup or links.
 */
export function AnnouncementBanner({ id, message, tone }: { id: string; message: string; tone: "info" | "warning" }) {
  const dismissed = useSyncExternalStore(dismissedAnnouncement.subscribe, dismissedAnnouncement.read, () => undefined);
  if (dismissed === undefined || dismissed === id) return null;
  const warning = tone === "warning";
  const Icon = warning ? TriangleAlert : Info;

  return <section aria-label="Announcement" className={cn(
    "mb-6 flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm leading-6",
    warning
      ? "border-[color-mix(in_srgb,var(--warning)_45%,var(--border))] bg-[color-mix(in_srgb,var(--warning)_12%,var(--card))]"
      : "border-[color-mix(in_srgb,var(--primary)_30%,var(--border))] bg-[var(--primary-soft)]",
  )}>
    <Icon className={cn("mt-1 size-4 shrink-0", warning ? "text-[var(--warning)]" : "text-[var(--primary)]")} aria-hidden="true" />
    <p className="min-w-0 flex-1 whitespace-pre-line break-words">{message}</p>
    <button type="button" onClick={() => dismissedAnnouncement.write(id)} aria-label="Dismiss announcement" className="-mr-1.5 grid size-9 shrink-0 place-items-center rounded-full text-[var(--muted-foreground)] outline-none hover:bg-[var(--surface-subtle)] hover:text-[var(--foreground)] focus-visible:ring-4 focus-visible:ring-[var(--primary-soft)]">
      <X className="size-4" />
    </button>
  </section>;
}
