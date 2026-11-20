"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { OctagonAlert } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { formatMinutes } from "@/lib/utils";

export type WeekResult = { weekStart: string; globalAfter: number; jobAfter: number; globalLimit: number | null };
type OccurrenceResult = {
  startsAt: string;
  endsAt: string;
  fits: boolean;
  over: "global" | "job" | null;
  badSpan: boolean;
  overlap: { jobName: string; startsAt: string; endsAt: string } | null;
  weeks: WeekResult[];
};
export type LimitCheck = { jobName: string; jobLimit: number | null; occurrences: OccurrenceResult[] };
// As in the clash notice: each result carries the request it answers, so a
// result for the previous times is never drawn against new ones.
type CheckState = { key: string } & ({ status: "unavailable" } | ({ status: "ok" } & LimitCheck));

function reason(occurrence: OccurrenceResult, check: LimitCheck, timeZone: string) {
  if (occurrence.overlap) {
    const { overlap } = occurrence;
    return `overlaps your ${overlap.jobName} shift, ${formatInTimeZone(overlap.startsAt, timeZone, "EEE h:mm a")}–${formatInTimeZone(overlap.endsAt, timeZone, "h:mm a")}`;
  }
  const week = occurrence.weeks.find((candidate) => occurrence.over === "global" ? candidate.globalLimit !== null && candidate.globalAfter > candidate.globalLimit : check.jobLimit !== null && candidate.jobAfter > check.jobLimit);
  if (occurrence.over === "global" && week && week.globalLimit !== null) return `puts that week at ${formatMinutes(week.globalAfter)}, over your ${formatMinutes(week.globalLimit)} weekly limit`;
  if (occurrence.over === "job" && week && check.jobLimit !== null) return `puts ${check.jobName} at ${formatMinutes(week.jobAfter)} that week, over its ${formatMinutes(check.jobLimit)} limit`;
  return "is not a valid span";
}

/**
 * Asks `/shifts/limit-check` what Save would meet, after the pickers settle,
 * returning only the result for the current inputs. The footer distinguishes
 * incomplete inputs, pending checks and failures. Save rechecks the series.
 */
export function useLimitCheck({ start, end, jobId, repeatWeeks, excludeId }: { start: string | null; end: string | null; jobId: string; repeatWeeks: number; excludeId?: string }) {
  const [state, setState] = useState<CheckState>({ key: "", status: "unavailable" });
  const key = `${start}|${end}|${jobId}|${repeatWeeks}|${excludeId ?? ""}`;

  useEffect(() => {
    if (!start || !end || !jobId) return;
    const controller = new AbortController();
    const timer = window.setTimeout(async () => {
      const query = new URLSearchParams({ start, end, job: jobId, repeat: String(repeatWeeks) });
      if (excludeId) query.set("exclude", excludeId);
      try {
        const response = await fetch(`/shifts/limit-check?${query}`, { signal: controller.signal, cache: "no-store" });
        const body = (await response.json()) as { status: string } & Partial<LimitCheck>;
        if (body.status === "ok" && body.occurrences) setState({ key, status: "ok", jobName: body.jobName ?? "", jobLimit: body.jobLimit ?? null, occurrences: body.occurrences });
        else setState({ key, status: "unavailable" });
      } catch (error) {
        if (!(error instanceof DOMException && error.name === "AbortError")) setState({ key, status: "unavailable" });
      }
    }, 400);
    return () => { controller.abort(); window.clearTimeout(timer); };
  }, [start, end, jobId, repeatWeeks, excludeId, key]);

  if (!start || !end || !jobId) return { status: "incomplete", check: null } as const;
  if (state.key !== key) return { status: "checking", check: null } as const;
  return { status: state.status, check: state.status === "ok" ? state : null } as const;
}

/** Whether a fitting shift brings a week to 80% of a limit or past it. */
export function isNearLimit(check: LimitCheck, week: WeekResult) {
  return (week.globalLimit !== null && week.globalAfter >= week.globalLimit * 0.8) || (check.jobLimit !== null && week.jobAfter >= check.jobLimit * 0.8);
}

/**
 * What Save would meet, in words: which limit or shift would refuse it, or
 * which weeks of a repeat would be skipped. A single shift that fits says
 * nothing here: the form's footer already shows the week with it.
 */
export function LimitCheckNotice({ check, jobId, timeZone }: { check: LimitCheck | null; jobId: string; timeZone: string }) {
  if (!check) return null;
  const state = check;
  const [first, ...rest] = state.occurrences;
  if (!first) return null;

  // Weekly repeats: how many make it, and which weeks would be skipped and why.
  if (rest.length) {
    const refused = state.occurrences.filter((occurrence) => !occurrence.fits);
    if (!refused.length) return null;
    return <details className={`shift-check ${refused.length === state.occurrences.length ? "shift-check-bad" : "shift-check-warn"}`}>
      <summary className="min-h-11 cursor-pointer content-center font-semibold">
        {refused.length} {refused.length === 1 ? "shift" : "shifts"} would be skipped
      </summary>
      <ul className="mt-1 grid gap-1">{refused.map((occurrence) => <li key={occurrence.startsAt}><b>{formatInTimeZone(occurrence.startsAt, timeZone, "MMM d")}</b> {reason(occurrence, state, timeZone)}</li>)}</ul>
    </details>;
  }

  if (!first.fits) return <div role="status" className="shift-check shift-check-bad">
    <OctagonAlert aria-hidden="true" />
    <div className="min-w-0">
      <p className="font-semibold">This shift {reason(first, state, timeZone)}.</p>
      <p className="mt-0.5 text-[var(--muted-foreground)]">{first.overlap ? "Change the times, or edit the other shift first." : <>Change the times, or raise the limit in <Link href={first.over === "job" ? `/jobs/${jobId}` : "/settings#week"} className="font-semibold text-[var(--primary)] underline-offset-4 hover:underline">{first.over === "job" ? state.jobName : "Settings"}</Link>.</>}</p>
    </div>
  </div>;

  return null;
}
