"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";

type Clash = { id: string; title: string; startsAt: string; endsAt: string };
// Each result carries the span it answers, so a result for the previous times
// is never shown against new ones while the next check is in flight.
type ClashState = { span: string } & ({ status: "idle" } | { status: "ok"; clashes: Clash[] } | { status: "needs_reconnect" } | { status: "unavailable" });

/**
 * Asks /integrations/google/clashes about the span once the pickers settle.
 * Half a second of quiet before asking, and every change aborts the request in
 * flight, so typing a time sends one request, not one per keystroke. Advisory
 * only: nothing here touches the form's submission.
 */
export function CalendarClashNotice({ startsAt, endsAt, timeZone, repeatWeeks }: { startsAt: string | null; endsAt: string | null; timeZone: string; repeatWeeks: number }) {
  const [state, setState] = useState<ClashState>({ span: "", status: "idle" });
  const span = `${startsAt}|${endsAt}`;

  useEffect(() => {
    if (!startsAt || !endsAt) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      try {
        const response = await fetch(`/integrations/google/clashes?start=${encodeURIComponent(startsAt)}&end=${encodeURIComponent(endsAt)}`, { signal: controller.signal, cache: "no-store" });
        const body = (await response.json()) as { status: string; clashes?: Clash[] };
        if (body.status === "ok") setState({ span, status: "ok", clashes: body.clashes ?? [] });
        else if (body.status === "needs_reconnect" || body.status === "unavailable") setState({ span, status: body.status });
        else setState({ span, status: "idle" });
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) setState({ span, status: "unavailable" });
      }
    }, 500);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [startsAt, endsAt, span]);

  if (!startsAt || !endsAt || state.span !== span || state.status === "idle") return null;
  if (state.status === "needs_reconnect") return <p className="-mt-2 text-sm text-[var(--muted-foreground)]">Google Calendar needs reconnecting. Clash check is off. <Link href="/settings" className="font-semibold text-[var(--primary)] underline-offset-4 hover:underline">Settings</Link></p>;
  if (state.status === "unavailable") return <p className="-mt-2 text-sm text-[var(--muted-foreground)]">Couldn&apos;t check Google Calendar right now.</p>;
  if (state.clashes.length === 0) return null;

  const time = (iso: string) => formatInTimeZone(iso, timeZone, "h:mm a");
  return <div role="status" className="-mt-2 flex gap-2.5 rounded-2xl bg-[color-mix(in_srgb,var(--warning)_13%,transparent)] px-3.5 py-3 text-sm leading-6 text-[color-mix(in_srgb,var(--warning)_62%,var(--foreground))]">
    <TriangleAlert className="mt-1 size-4 shrink-0" />
    <div>
      <p className="font-medium">Overlaps {state.clashes.length === 1 ? "an event" : `${state.clashes.length} events`} in your Google Calendar{repeatWeeks > 1 ? " (checked for the first week)" : ""}:</p>
      <ul className="mt-1">{state.clashes.map((clash) => <li key={clash.id}><b>{clash.title}</b> {time(clash.startsAt)}–{time(clash.endsAt)}</li>)}</ul>
    </div>
  </div>;
}
