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
  alerts: [{ level: 80, title: "Approaching your weekly cap", detail: "Your planned hours will reach 80% of your 40-hour cap.", severity: "warning" }],
  earnings: { grossCents: 24_500, taxCents: 5_145, deductionCents: 1_045, netCents: 18_310 },
  monthlyJobAllocation: {
    series: [
      { id: "job-campus", key: "job-job-campus", name: "Campus desk", color: "#9486ff" },
      { id: "job-cafe", key: "job-job-cafe", name: "River café", color: "#32d583" },
    ],
    months: [
      { key: "2026-03", label: "Mar", netCents: { "job-job-campus": 8_640, "job-job-cafe": 6_220 }, loggedMinutes: { "job-job-campus": 720, "job-job-cafe": 510 } },
      { key: "2026-04", label: "Apr", netCents: { "job-job-campus": 9_120, "job-job-cafe": 6_650 }, loggedMinutes: { "job-job-campus": 760, "job-job-cafe": 540 } },
      { key: "2026-05", label: "May", netCents: { "job-job-campus": 8_040, "job-job-cafe": 7_260 }, loggedMinutes: { "job-job-campus": 670, "job-job-cafe": 600 } },
      { key: "2026-06", label: "Jun", netCents: { "job-job-campus": 9_840, "job-job-cafe": 7_010 }, loggedMinutes: { "job-job-campus": 820, "job-job-cafe": 580 } },
      { key: "2026-07", label: "Jul", netCents: { "job-job-campus": 9_360, "job-job-cafe": 7_500 }, loggedMinutes: { "job-job-campus": 780, "job-job-cafe": 620 } },
      { key: "2026-08", label: "Aug", netCents: { "job-job-campus": 10_656, "job-job-cafe": 7_654 }, loggedMinutes: { "job-job-campus": 960, "job-job-cafe": 630 } },
    ],
  },
  isDemo: true,
};
