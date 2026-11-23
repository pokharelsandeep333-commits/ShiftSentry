"use client";

import { useId, useState } from "react";
import { FieldAffix, SettingRow } from "@/components/settings/setting-row";
import { fieldA11y } from "@/components/ui/field-error";
import { PremiumSelect } from "@/components/ui/premium-select";
import type { FieldErrors } from "@/lib/form-state";
import { PAY_FREQUENCY_OPTIONS, formatPayPeriod, isCalendarDate, payFrequencyOf, payPeriodFor, type PayFrequency, type PaySchedule } from "@/lib/pay-period";

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
 * The pay schedule part of the job forms, as setting rows for a `divide-y`
 * parent. The rows follow the frequency, and the frequency row's hint names
 * the current and next period as you type, because a biweekly anchor one week
 * off is otherwise invisible until the dashboard is wrong. `today` is the
 * viewer's local date from the server, so the preview cannot disagree with the
 * page about which day it is. The input names are `createJob` and
 * `updateJobDetails`'s contract.
 */
export function PayScheduleFields({ schedule, today, errors = {} }: { schedule: PaySchedule | null; today: string; errors?: FieldErrors }) {
  const id = useId();
  const [frequency, setFrequency] = useState<PayFrequency>(payFrequencyOf(schedule));
  const [anchorDate, setAnchorDate] = useState(schedule?.kind === "every_n_weeks" ? schedule.anchorDate : "");
  const [monthDay, setMonthDay] = useState(String(schedule?.kind === "monthly_day" ? schedule.monthDay : 1));
  const draft = draftSchedule(frequency, anchorDate, monthDay);
  const current = draft ? payPeriodFor(today, draft) : null;
  const next = draft && current ? payPeriodFor(current.end, draft) : null;
  const errorId = (field: string) => `${id}-${field}-error`;

  return <>
    <SettingRow
      label="Pay period"
      labelId={`${id}-frequency`}
      hintId={`${id}-preview`}
      hint={<span aria-live="polite">
        {frequency === "none" ? "Optional. Shows each pay period's hours and pay on your dashboard."
          : current && next ? <>This period: <span className="font-semibold text-[var(--foreground)]">{formatPayPeriod(current)}</span> · Next: {formatPayPeriod(next)}</>
          : "Then pick a day a period started."}
      </span>}
      error={errors.payFrequency}
      errorId={errorId("frequency")}
    >
      <PremiumSelect name="payFrequency" labelledBy={`${id}-frequency`} defaultValue={frequency} options={PAY_FREQUENCY_OPTIONS} onValueChange={(value) => setFrequency(value as PayFrequency)} invalid={Boolean(errors.payFrequency)} describedBy={fieldA11y(errorId("frequency"), errors.payFrequency, `${id}-preview`)["aria-describedby"]} />
    </SettingRow>

    {frequency === "monthly" && <SettingRow label="Each period starts on" labelId={`${id}-month-day`} hint="Shorter months start on their last day." error={errors.payMonthDay} errorId={errorId("month-day")}>
      <PremiumSelect name="payMonthDay" labelledBy={`${id}-month-day`} defaultValue={monthDay} options={MONTH_DAY_OPTIONS} onValueChange={setMonthDay} invalid={Boolean(errors.payMonthDay)} describedBy={errors.payMonthDay ? errorId("month-day") : undefined} />
    </SettingRow>}

    {frequency !== "none" && frequency !== "monthly" && <SettingRow label="A day a period started" labelFor={`${id}-anchor`} hint="Any one works, like the first day on a paystub." hintId={`${id}-anchor-hint`} error={errors.payAnchorDate} errorId={errorId("anchor")}>
      <input id={`${id}-anchor`} name="payAnchorDate" type="date" required value={anchorDate} onChange={(event) => setAnchorDate(event.target.value)} {...fieldA11y(errorId("anchor"), errors.payAnchorDate, `${id}-anchor-hint`)} className="field-control" />
    </SettingRow>}

    {frequency !== "none" && <SettingRow label="Payday" labelFor={`${id}-payday`} hint="Days after a period ends. Optional." hintId={`${id}-payday-hint`} error={errors.paydayOffsetDays} errorId={errorId("payday")}>
      <div className="relative">
        <input id={`${id}-payday`} name="paydayOffsetDays" type="number" min={0} max={31} step={1} defaultValue={schedule?.paydayOffsetDays ?? ""} placeholder="e.g. 7" {...fieldA11y(errorId("payday"), errors.paydayOffsetDays, `${id}-payday-hint`)} className="field-control !pr-24" />
        <FieldAffix>days after</FieldAffix>
      </div>
    </SettingRow>}
  </>;
}
