"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createLocalPreference } from "@/lib/local-preference";

const calendarViewPreference = createLocalPreference<"week" | "month">("shiftsentry:calendar-view", "week", (value) => (value === "week" || value === "month" ? value : null));

/**
 * Remembers the last view. Opening /calendar with no `view` in the URL sends a
 * viewer who last chose month to month view. The server cannot read
 * localStorage, so this is one client-side replace -- and never a loop, because
 * the replaced URL names its view.
 */
export function CalendarViewMemory({ view, explicit }: { view: "week" | "month"; explicit: boolean }) {
  const router = useRouter();
  useEffect(() => {
    if (explicit) { calendarViewPreference.write(view); return; }
    if (view === "week" && calendarViewPreference.read() === "month") router.replace("/calendar?view=month");
  }, [explicit, router, view]);
  return null;
}
