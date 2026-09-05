export type AppRole = "USER" | "ADMIN";

export type JobSummary = {
  id: string;
  name: string;
  color: string;
  weeklyLimitMinutes: number | null;
  usedMinutes: number;
  scheduledMinutes: number;
};

export type EarningsSummary = {
  grossCents: number;
  taxCents: number;
  deductionCents: number;
  netCents: number;
};

/** One job's share of a period. Minutes travel with the money so the breakdown
 *  can answer "which job" for either metric without a second shape. */
export type PeriodJobTotal = {
  id: string;
  name: string;
  color: string;
  netCents: number;
  minutes: number;
};

/** Worked time only -- clipped at `now`, so it never includes scheduled hours. */
export type PeriodTotals = {
  minutes: number;
  earnings: EarningsSummary;
  jobs: PeriodJobTotal[];
};

/** One calendar month in the viewer's zone, keyed `YYYY-MM`. */
export type MonthTotals = PeriodTotals & {
  key: string;
  label: string;
};

export type DashboardTotals = {
  /**
   * Sub-month and clipped at now, so it cannot be derived from month buckets
   * and is computed on its own.
   */
  week: PeriodTotals;
  /**
   * A contiguous run from the first month worked to the month in progress. Any
   * other range the card offers is a slice of this summed on the client, which
   * is why switching range costs no query.
   */
  months: MonthTotals[];
};

export type MonthlyJobAllocationSeries = {
  id: string;
  key: string;
  name: string;
  color: string;
};

export type MonthlyJobAllocation = {
  series: MonthlyJobAllocationSeries[];
  months: {
    key: string;
    label: string;
    netCents: Record<string, number>;
    loggedMinutes: Record<string, number>;
  }[];
};

export type ShiftSummary = {
  id: string;
  jobId: string;
  jobName: string;
  jobColor: string;
  startsAt: string;
  endsAt: string;
  notes?: string | null;
};

export type ThresholdAlert = {
  level: 80 | 90 | 100;
  title: string;
  detail: string;
  severity: "warning" | "danger";
};

export type DashboardData = {
  viewer: { email: string; name: string | null; timeZone: string; weekStartsOn: number };
  globalLimitMinutes: number | null;
  loggedMinutes: number;
  scheduledMinutes: number;
  jobs: JobSummary[];
  upcomingShifts: ShiftSummary[];
  alerts: ThresholdAlert[];
  totals: DashboardTotals;
  monthlyJobAllocation: MonthlyJobAllocation;
  isDemo?: boolean;
};
