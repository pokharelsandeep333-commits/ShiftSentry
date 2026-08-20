import type { DashboardData } from "@/lib/types";

export const demoDashboard: DashboardData = {
  viewer: { email: "demo@shiftsaas.app", name: "Alex", timeZone: "America/Chicago", weekStartsOn: 0 },
  globalLimitMinutes: 2_400,
  loggedMinutes: 1_590,
  scheduledMinutes: 330,
  jobs: [
    { id: "job-campus", name: "Campus desk", color: "#9486ff", weeklyLimitMinutes: 1_200, usedMinutes: 960, scheduledMinutes: 180, earnedNetCents: 10_656 },
    { id: "job-cafe", name: "River café", color: "#32d583", weeklyLimitMinutes: 900, usedMinutes: 630, scheduledMinutes: 150, earnedNetCents: 7_654 },
  ],
  upcomingShifts: [
    { id: "demo-1", jobId: "job-campus", jobName: "Campus desk", jobColor: "#9486ff", startsAt: "2026-08-21T16:00:00.000Z", endsAt: "2026-08-21T20:00:00.000Z", notes: "Evening desk coverage" },
    { id: "demo-2", jobId: "job-cafe", jobName: "River café", jobColor: "#32d583", startsAt: "2026-08-22T14:00:00.000Z", endsAt: "2026-08-22T16:30:00.000Z", notes: null },
  ],
  history: [
    { label: "Jul 20", loggedMinutes: 1_980, limitMinutes: 2_400 },
    { label: "Jul 27", loggedMinutes: 2_140, limitMinutes: 2_400 },
    { label: "Aug 3", loggedMinutes: 1_740, limitMinutes: 2_400 },
    { label: "Aug 10", loggedMinutes: 2_240, limitMinutes: 2_400 },
    { label: "This week", loggedMinutes: 1_590, limitMinutes: 2_400 },
  ],
  alerts: [{ level: 80, title: "Approaching your weekly cap", detail: "Your planned hours will reach 80% of your 40-hour cap.", severity: "warning" }],
  earnings: { grossCents: 24_500, taxCents: 5_145, deductionCents: 1_045, netCents: 18_310 },
  earningsHistory: [{ label: "Jul 20", netCents: 16_850 }, { label: "Jul 27", netCents: 18_120 }, { label: "Aug 3", netCents: 15_450 }, { label: "Aug 10", netCents: 19_010 }, { label: "This week", netCents: 18_310 }],
  isDemo: true,
};
