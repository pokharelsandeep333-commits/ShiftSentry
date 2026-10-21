"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { CircleCheck, OctagonAlert, TriangleAlert } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { formatMinutes } from "@/lib/utils";

type WeekResult = { weekStart: string; globalAfter: number; jobAfter: number };
type OccurrenceResult = {
  startsAt: string;
  endsAt: string;
  fits: boolean;
  over: "global" | "job" | null;
  badSpan: boolean;
  overlap: { jobName: string; startsAt: string; endsAt: string } | null;
  weeks: WeekResult[];
};
type Check = { jobName: string; globalLimit: number | null; jobLimit: number | null; occurrences: OccurrenceResult[] };
// As in the clash notice: each result carries the request it answers, so a
// result for the previous times is never drawn against new ones.
type CheckState = { key: string } & ({ status: "idle" } | ({ status: "ok" } & Check));

function reason(occurrence: OccurrenceResult, check: Check, timeZone: string) {
  if (occurrence.overlap) {
    const { overlap } = occurrence;
    return `overlaps your ${overlap.jobName} shift, ${formatInTimeZone(overlap.startsAt, timeZone, "EEE h:mm a")}–${formatInTimeZone(overlap.endsAt, timeZone, "h:mm a")}`;
  }
  const week = occurrence.weeks.find((candidate) => occurrence.over === "global" ? check.globalLimit !== null && candidate.globalAfter > check.globalLimit : check.jobLimit !== null && candidate.jobAfter > check.jobLimit);
  if (occurrence.over === "global" && week && check.globalLimit !== null) return `puts that week at ${formatMinutes(week.globalAfter)}, over your ${formatMinutes(check.globalLimit)} weekly limit`;
  if (occurrence.over === "job" && week && check.jobLimit !== null) return `puts ${check.jobName} at ${formatMinutes(week.jobAfter)} that week, over its ${formatMinutes(check.jobLimit)} limit`;
  return "is not a valid span";
}

function Tally({ label, after, limit }: { label: string; after: number; limit: number | null }) {
  return <span className="whitespace-nowrap"><span className="text-[var(--muted-foreground)]">{label}</span> <b className="font-semibold text-[var(--foreground)]">{formatMinutes(after)}</b>{limit !== null && <span className="text-[var(--muted-foreground)]"> of {formatMinutes(limit)}</span>}</span>;
}

/**
 * What Save would meet: the week's totals once this shift is in, or which
 * limit or shift would refuse it. Asks `/shifts/limit-check` after the pickers
 * settle, the way the calendar clash check does. The database decides on
 * Save; this only says so earlier.
 */
export function LimitCheckNotice({ start, end, jobId, repeatWeeks, excludeId, timeZone }: { start: string | null; end: string | null; jobId: string; repeatWeeks: number; excludeId?: string; timeZone: string }) {
  const [state, setState] = useState<CheckState>({ key: "", status: "idle" });
  const key = `${start}|${end}|${jobId}|${repeatWeeks}`;

  useEffect(() => {
    if (!start || !end || !jobId) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      const query = new URLSearchParams({ start, end, job: jobId, repeat: String(repeatWeeks) });
      if (excludeId) query.set("exclude", excludeId);
      try {
        const response = await fetch(`/shifts/limit-check?${query}`, { signal: controller.signal, cache: "no-store" });
        const body = (await response.json()) as { status: string } & Partial<Check>;
        if (body.status === "ok" && body.occurrences) setState({ key, status: "ok", jobName: body.jobName ?? "", globalLimit: body.globalLimit ?? null, jobLimit: body.jobLimit ?? null, occurrences: body.occurrences });
        else setState({ key, status: "idle" });
      } catch (error) {
        // Advisory: when the check cannot run, say nothing rather than guess.
        if (!(error instanceof DOMException && error.name === "AbortError")) setState({ key, status: "idle" });
      }
    }, 400);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [start, end, jobId, repeatWeeks, excludeId, key]);

  if (!start || !end || state.key !== key || state.status !== "ok") return null;
  const [first, ...rest] = state.occurrences;
  if (!first) return null;

  // Weekly repeats: how many make it, and which weeks would be skipped and why.
  if (rest.length) {
    const refused = state.occurrences.filter((occurrence) => !occurrence.fits);
    if (!refused.length) return <p role="status" className="shift-check shift-check-ok"><CircleCheck aria-hidden="true" />All {state.occurrences.length} weeks fit your limits.</p>;
    const tone = refused.length === state.occurrences.length ? "shift-check-bad" : "shift-check-warn";
    return <div role="status" className={`shift-check ${tone}`}>
      <TriangleAlert aria-hidden="true" />
      <div className="min-w-0">
        <p className="font-semibold">{refused.length === state.occurrences.length ? "None of these weeks would be saved." : `${state.occurrences.length - refused.length} of ${state.occurrences.length} weeks fit. The rest would be skipped:`}</p>
        <ul className="mt-1 grid gap-0.5">{refused.map((occurrence) => <li key={occurrence.startsAt}><b className="font-semibold">{formatInTimeZone(occurrence.startsAt, timeZone, "MMM d")}</b> {reason(occurrence, state, timeZone)}</li>)}</ul>
      </div>
    </div>;
  }

  if (!first.fits) return <div role="status" className="shift-check shift-check-bad">
    <OctagonAlert aria-hidden="true" />
    <div className="min-w-0">
      <p className="font-semibold">This shift {reason(first, state, timeZone)}.</p>
      <p className="mt-0.5 text-[var(--muted-foreground)]">{first.overlap ? "Change the times, or edit the other shift first." : <>Change the times, or raise the limit in <Link href={first.over === "job" ? `/jobs/${jobId}` : "/settings#week"} className="font-semibold text-[var(--primary)] underline-offset-4 hover:underline">{first.over === "job" ? state.jobName : "Settings"}</Link>.</>}</p>
    </div>
  </div>;

  // It fits: the totals for the week (or each week, for one across the boundary).
  const close = first.weeks.some((week) => (state.globalLimit !== null && week.globalAfter >= state.globalLimit * 0.8) || (state.jobLimit !== null && week.jobAfter >= state.jobLimit * 0.8));
  return <div role="status" className={`shift-check ${close ? "shift-check-warn" : "shift-check-ok"}`}>
    {close ? <TriangleAlert aria-hidden="true" /> : <CircleCheck aria-hidden="true" />}
    <div className="min-w-0">
      {first.weeks.map((week) => <p key={week.weekStart} className="flex flex-wrap gap-x-3 gap-y-0.5">
        <span className="font-semibold">{first.weeks.length > 1 ? `Week of ${formatInTimeZone(week.weekStart, timeZone, "MMM d")}` : "This week with it"}</span>
        <Tally label="All jobs" after={week.globalAfter} limit={state.globalLimit} />
        <Tally label={state.jobName} after={week.jobAfter} limit={state.jobLimit} />
      </p>)}
    </div>
  </div>;
}
