export type AppRole = "USER" | "ADMIN";

export type JobSummary = {
  id: string;
  name: string;
  color: string;
  weeklyLimitMinutes: number | null;
  usedMinutes: number;
  scheduledMinutes: number;
  earnedNetCents: number;
};

export type EarningsSummary = {
  grossCents: number;
  taxCents: number;
  deductionCents: number;
  netCents: number;
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
  earnings: EarningsSummary;
  monthlyJobAllocation: MonthlyJobAllocation;
  isDemo?: boolean;
};
