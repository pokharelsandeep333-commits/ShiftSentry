import type { DashboardData } from "@/lib/types";

const CAMPUS = { id: "job-campus", name: "Campus desk", color: "#9486ff" };
const CAFE = { id: "job-cafe", name: "River café", color: "#32d583" };

/**
 * The current week is the landing page's example week (`EXAMPLE_WEEK` in
 * `src/lib/welcome-week.ts`), so the dashboard screenshots on the landing tell
 * the same story as the interactive card above them: a 20h limit, Campus desk
 * 8h worked plus a planned 3h Friday under its own 12h cap, River café 5h with
 * no cap, 16h in all. Pay is `calculateEarnings` per job at 12% tax, no
 * deductions ($155.00 gross, $136.40 net), and the alerts are the ones
 * `dashboard.ts` raises for these numbers, in its own words. No viewer name:
 * the dashboard heading names the week, not the person.
 */
export const demoDashboard: DashboardData = {
  viewer: { email: "demo@shiftsaas.app", name: null, timeZone: "America/Chicago", weekStartsOn: 0 },
  globalLimitMinutes: 1_200,
  loggedMinutes: 780,
  scheduledMinutes: 180,
  jobs: [
    { ...CAMPUS, weeklyLimitMinutes: 720, usedMinutes: 480, scheduledMinutes: 180 },
    { ...CAFE, weeklyLimitMinutes: null, usedMinutes: 300, scheduledMinutes: 0 },
  ],
  upcomingShifts: [
    { id: "demo-1", jobId: "job-campus", jobName: "Campus desk", jobColor: "#9486ff", startsAt: "2026-08-21T16:00:00.000Z", endsAt: "2026-08-21T19:00:00.000Z", notes: null },
  ],
  alerts: [
    { level: 80, title: "Approaching your weekly cap", detail: "Your planned hours reach 80% of your global cap.", severity: "warning" },
    { level: 90, title: "Approaching your Campus desk limit", detail: "Planned hours reach 92% of this job's weekly cap.", severity: "warning" },
  ],
  // Mar through Aug mirror the monthly allocation below, so the card and the
  // chart agree; Jan and Feb sit behind the chart's window to give "all time"
  // and "year to date" something the six-month presets do not already cover.
  totals: {
    week: {
      minutes: 780,
      earnings: { grossCents: 15_500, taxCents: 1_860, deductionCents: 0, netCents: 13_640 },
      jobs: [{ ...CAMPUS, netCents: 8_800, minutes: 480 }, { ...CAFE, netCents: 4_840, minutes: 300 }],
    },
    months: [
      { key: "2026-01", label: "Jan 2026", minutes: 1_120, earnings: { grossCents: 18_065, taxCents: 3_794, deductionCents: 771, netCents: 13_500 }, jobs: [{ ...CAMPUS, netCents: 7_920, minutes: 660 }, { ...CAFE, netCents: 5_580, minutes: 460 }] },
      { key: "2026-02", label: "Feb 2026", minutes: 1_180, earnings: { grossCents: 19_055, taxCents: 4_002, deductionCents: 813, netCents: 14_240 }, jobs: [{ ...CAMPUS, netCents: 8_280, minutes: 690 }, { ...CAFE, netCents: 5_960, minutes: 490 }] },
      { key: "2026-03", label: "Mar 2026", minutes: 1_230, earnings: { grossCents: 19_885, taxCents: 4_176, deductionCents: 849, netCents: 14_860 }, jobs: [{ ...CAMPUS, netCents: 8_640, minutes: 720 }, { ...CAFE, netCents: 6_220, minutes: 510 }] },
      { key: "2026-04", label: "Apr 2026", minutes: 1_300, earnings: { grossCents: 21_103, taxCents: 4_432, deductionCents: 901, netCents: 15_770 }, jobs: [{ ...CAMPUS, netCents: 9_120, minutes: 760 }, { ...CAFE, netCents: 6_650, minutes: 540 }] },
      { key: "2026-05", label: "May 2026", minutes: 1_270, earnings: { grossCents: 20_474, taxCents: 4_300, deductionCents: 874, netCents: 15_300 }, jobs: [{ ...CAMPUS, netCents: 8_040, minutes: 670 }, { ...CAFE, netCents: 7_260, minutes: 600 }] },
      { key: "2026-06", label: "Jun 2026", minutes: 1_400, earnings: { grossCents: 22_548, taxCents: 4_735, deductionCents: 963, netCents: 16_850 }, jobs: [{ ...CAMPUS, netCents: 9_840, minutes: 820 }, { ...CAFE, netCents: 7_010, minutes: 580 }] },
      { key: "2026-07", label: "Jul 2026", minutes: 1_400, earnings: { grossCents: 22_561, taxCents: 4_738, deductionCents: 963, netCents: 16_860 }, jobs: [{ ...CAMPUS, netCents: 9_360, minutes: 780 }, { ...CAFE, netCents: 7_500, minutes: 620 }] },
      { key: "2026-08", label: "Aug 2026", minutes: 1_590, earnings: { grossCents: 24_502, taxCents: 5_145, deductionCents: 1_047, netCents: 18_310 }, jobs: [{ ...CAMPUS, netCents: 10_656, minutes: 960 }, { ...CAFE, netCents: 7_654, minutes: 630 }] },
    ],
  },
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
