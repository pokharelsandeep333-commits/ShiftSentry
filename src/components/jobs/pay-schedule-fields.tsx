"use client";

import { useId, useState } from "react";
import { PremiumSelect } from "@/components/ui/premium-select";
import { PAY_FREQUENCY_OPTIONS, formatPayPeriod, isCalendarDate, payFrequencyOf, payPeriodFor, type PayFrequency, type PaySchedule } from "@/lib/pay-period";
import { cn } from "@/lib/utils";

const MONTH_DAY_OPTIONS = Array.from({ length: 31 }, (_, index) => {
  const day = index + 1;
  const suffix = day % 10 === 1 && day !== 11 ? "st" : day % 10 === 2 && day !== 12 ? "nd" : day % 10 === 3 && day !== 13 ? "rd" : "th";
  return { value: String(day), label: `The ${day}${suffix}${day > 28 ? " (or last day)" : ""}` };
});

/** The schedule the fields currently describe, or null while it is incomplete. */
function draftSchedule(frequency: PayFrequency, anchorDate: string, monthDay: string): PaySchedule | null {
  if (frequency === "none") return null;
  if (frequency === "monthly") return { kind: "monthly_day", monthDay: Number(monthDay), paydayOffsetDays: null };
  return isCalendarDate(anchorDate) ? { kind: "every_n_weeks", intervalWeeks: Number(frequency.slice(0, -1)), anchorDate, paydayOffsetDays: null } : null;
}

/**
 * The pay schedule part of the job forms. The fields follow the frequency, and
 * a preview names the current and next period as you type, because a biweekly
 * anchor one week off is otherwise invisible until the dashboard is wrong.
 * `today` is the viewer's local date from the server, so the preview cannot
 * disagree with the page about which day it is.
 */
export function PayScheduleFields({ schedule, today, compact = false }: { schedule: PaySchedule | null; today: string; compact?: boolean }) {
  const id = useId();
  const [frequency, setFrequency] = useState<PayFrequency>(payFrequencyOf(schedule));
  const [anchorDate, setAnchorDate] = useState(schedule?.kind === "every_n_weeks" ? schedule.anchorDate : "");
  const [monthDay, setMonthDay] = useState(String(schedule?.kind === "monthly_day" ? schedule.monthDay : 1));
  const draft = draftSchedule(frequency, anchorDate, monthDay);
  const current = draft ? payPeriodFor(today, draft) : null;
  const next = draft && current ? payPeriodFor(current.end, draft) : null;
  const labelClass = cn("field-label", compact && "text-xs");
  const controlClass = cn("field-control", compact && "h-10 text-sm");

  return <fieldset className="grid gap-3 rounded-2xl border border-dashed p-3.5">
    <legend className="px-1 text-sm font-semibold">Pay period</legend>
    <div className="grid gap-3 sm:grid-cols-2">
      <div className={labelClass}>
        <span id={`${id}-frequency`}>How often you are paid</span>
        <PremiumSelect name="payFrequency" labelledBy={`${id}-frequency`} defaultValue={frequency} options={PAY_FREQUENCY_OPTIONS} onValueChange={(value) => setFrequency(value as PayFrequency)} />
      </div>
      {frequency === "monthly" && <div className={labelClass}>
        <span id={`${id}-month-day`}>Each period starts on</span>
        <PremiumSelect name="payMonthDay" labelledBy={`${id}-month-day`} defaultValue={monthDay} options={MONTH_DAY_OPTIONS} onValueChange={setMonthDay} />
      </div>}
      {frequency !== "none" && frequency !== "monthly" && <label className={labelClass}>
        <span>A day a period started</span>
        <input name="payAnchorDate" type="date" required value={anchorDate} onChange={(event) => setAnchorDate(event.target.value)} className={controlClass} />
      </label>}
    </div>
    {frequency !== "none" && <label className={labelClass}>
      <span>Payday, in days after a period ends <span className="font-normal text-[var(--muted-foreground)]">(optional)</span></span>
      <input name="paydayOffsetDays" type="number" min={0} max={31} step={1} defaultValue={schedule?.paydayOffsetDays ?? ""} placeholder="e.g. 7" className={controlClass} />
    </label>}
    <p className="text-xs leading-5 text-[var(--muted-foreground)]" aria-live="polite">
      {frequency === "none" ? "Set this to see each pay period's hours and pay on your dashboard."
        : current && next ? <>This period: <span className="font-semibold text-[var(--foreground)]">{formatPayPeriod(current)}</span> · Next: {formatPayPeriod(next)}</>
        : "Pick any day a pay period started. The first day on a paystub works."}
    </p>
  </fieldset>;
}
