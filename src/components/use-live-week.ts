"use client";

import { useEffect, useMemo, useState } from "react";
import { liveWeekJobs, type LiveTimer } from "@/lib/shift-timer";

const TICK_MS = 15_000;

/**
 * This week's per-job minutes with a running timer counted as it ticks
 * (`liveWeekJobs`), for the header meter and the dashboard's cap card. The
 * first render uses `countedAt`, the server's own moment, so hydration matches;
 * the clock moves on from the first tick. With no timer nothing ticks and the
 * server's totals pass straight through.
 */
export function useLiveWeekJobs<J extends { id: string; usedMinutes: number; scheduledMinutes: number }>(jobs: J[], timer: LiveTimer | null, countedAt: string, timeZone: string, weekStartsOn: number) {
  const [now, setNow] = useState(() => new Date(countedAt));
  const running = timer?.startedAt ?? null;
  useEffect(() => {
    if (!running) return;
    const tick = () => setNow(new Date());
    const first = window.setTimeout(tick, 0);
    const interval = window.setInterval(tick, TICK_MS);
    return () => { window.clearTimeout(first); window.clearInterval(interval); };
  }, [running]);
  return useMemo(() => liveWeekJobs(jobs, timer, new Date(countedAt), timer ? now : new Date(countedAt), timeZone, weekStartsOn), [jobs, timer, countedAt, now, timeZone, weekStartsOn]);
}
