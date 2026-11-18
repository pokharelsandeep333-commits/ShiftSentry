import type { SavedFormState } from "@/lib/form-state";

export type BreakPeriod = {
  id: string;
  start_date: string;
  end_date: string;
  weekly_limit_minutes: number;
  label: string | null;
};

export type BreakPeriodImpact = {
  confirmation: string;
  weeks: { week_start: string; scheduled_minutes: number; cap_minutes: number }[];
};

export type BreakPeriodActionState = SavedFormState & { impact?: BreakPeriodImpact };

/** The inclusive range containing the local week-start date sets the whole week's cap. */
export function breakPeriodForWeek(periods: readonly BreakPeriod[], weekStartDate: string): BreakPeriod | null {
  return periods.find(({ start_date, end_date }) => start_date <= weekStartDate && weekStartDate <= end_date) ?? null;
}
