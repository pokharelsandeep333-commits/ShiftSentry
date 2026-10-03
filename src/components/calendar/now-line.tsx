"use client";

import { useCallback, useSyncExternalStore } from "react";
import { formatInTimeZone } from "date-fns-tz";

const subscribe = (tick: () => void) => {
  const timer = window.setInterval(tick, 30_000);
  return () => window.clearInterval(timer);
};
const onServer = () => -1;

/**
 * The current time across today's column. The server snapshot is "nowhere", so
 * hydration matches and the line appears on the first client render; it is
 * re-read every 30 seconds and vanishes once the local date rolls past `today`.
 * The snapshot is a minute count, so an unchanged minute does not re-render.
 * It is placed against the grid's CSS `--hour`, so it tracks the sized hours.
 */
export function NowLine({ today, timeZone }: { today: string; timeZone: string }) {
  const read = useCallback(() => {
    const now = new Date();
    if (formatInTimeZone(now, timeZone, "yyyy-MM-dd") !== today) return -1;
    const [hours, minutes] = formatInTimeZone(now, timeZone, "H:m").split(":").map(Number);
    return hours * 60 + minutes;
  }, [today, timeZone]);
  const minutes = useSyncExternalStore(subscribe, read, onServer);

  if (minutes < 0) return null;
  return <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 z-20 flex items-center" style={{ top: `calc(var(--hour) * ${minutes / 60} - 5px)` }}>
    <span className="-ml-[5px] size-2.5 shrink-0 rounded-full bg-[var(--danger)]" />
    <span className="h-0.5 flex-1 bg-[var(--danger)]" />
  </div>;
}
