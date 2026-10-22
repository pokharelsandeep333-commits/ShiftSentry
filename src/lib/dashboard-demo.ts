import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import type { DashboardData } from "@/lib/types";
import { buildDashboardInsights, recentCompletedShifts, type DashboardShift } from "@/lib/dashboard-insights";
import { addDays } from "@/lib/pay-period";
import { bucketWorkedShiftsByMonth, combineMonthTotals } from "@/lib/period-totals";
import { weekStartFor } from "@/lib/time";
import { allocateWeekMinutes } from "@/lib/week-meter";

const CAMPUS = { id: "job-campus", name: "Campus desk", color: "#9486ff" };
const CAFE = { id: "job-cafe", name: "River café", color: "#32d583" };

/**
 * The current week is the landing page's example week (`EXAMPLE_WEEK` in
 * `src/lib/welcome-week.ts`), so the dashboard screenshots on the landing tell
 * the same story as the interactive card above them: a 20h limit, Campus desk
 * 8h worked plus a planned 3h Friday under its own 12h cap, River café 5h with
 * no cap, 16h in all. Pay is `calculateEarnings` per job at 12% tax, no
 * deductions ($155.00 gross, $136.40 net). The week card works out its own
 * warnings from these numbers. No viewer name: the greeting stands alone.
 */
export const demoDashboard: DashboardData = {
  ...buildDashboardInsights([], new Date("2026-10-21T23:00:00Z"), "America/Chicago", 0),
  recentShifts: [],
  viewer: { email: "demo@shiftsaas.app", name: null, timeZone: "America/Chicago", weekStartsOn: 0 },
  globalLimitMinutes: 1_200,
  loggedMinutes: 780,
  scheduledMinutes: 180,
  jobs: [
    { ...CAMPUS, weeklyLimitMinutes: 720, usedMinutes: 480, scheduledMinutes: 180 },
    { ...CAFE, weeklyLimitMinutes: null, usedMinutes: 300, scheduledMinutes: 0 },
  ],
  currentShift: null,
  // Dated by `demoDashboardFor`; a fixed date here went stale within a week.
  upcomingShifts: [],
  // The last six months mirror the monthly allocation below, so the card and
  // the chart agree; the two before sit behind the chart's window to give "all
  // time" something the six-month presets do not already cover. The keys and
  // labels here are placeholders: `demoDashboardFor` relabels them.
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
  // No pay schedules in the sample: the landing's dashboard captures are taken
  // from this page, and a new card here would leave them out of date.
  payPeriods: [],
  isDemo: true,
};

/**
 * The sample, dated around `now` so it never looks stale: the planned 3h
 * Campus desk shift falls on the coming Friday, 11 AM to 2 PM in the sample's
 * zone (the "planned 3h Friday" of the example week), and the months are
 * relabelled as the ones ending this month. The figures do not change.
 */
export function demoDashboardFor(now: Date): DashboardData {
  const { timeZone } = demoDashboard.viewer;
  const today = formatInTimeZone(now, timeZone, "yyyy-MM-dd");
  const [year, month, day] = today.split("-").map(Number);
  const noon = (offsetDays: number) => new Date(Date.UTC(year, month - 1, day + offsetDays, 12));
  // Days until Friday; today counts only while 11 AM is still ahead.
  let ahead = (5 - noon(0).getUTCDay() + 7) % 7;
  if (ahead === 0 && formatInTimeZone(now, timeZone, "HH:mm") >= "11:00") ahead = 7;
  const friday = noon(ahead).toISOString().slice(0, 10);
  const shift = { id: "demo-1", jobId: "job-campus", jobName: "Campus desk", jobColor: "#9486ff", startsAt: fromZonedTime(`${friday}T11:00:00`, timeZone).toISOString(), endsAt: fromZonedTime(`${friday}T14:00:00`, timeZone).toISOString(), notes: null };
  const weekStart = formatInTimeZone(weekStartFor(now, timeZone, 0), timeZone, "yyyy-MM-dd");
  const sample = (id: string, job: typeof CAMPUS, date: string, start: string, end: string, rate: number): DashboardShift => ({ id, jobId: job.id, jobName: job.name, jobColor: job.color, startsAt: fromZonedTime(`${date}T${start}:00`, timeZone), endsAt: fromZonedTime(`${date}T${end}:00`, timeZone), hourlyRateCents: rate, taxRateBasisPoints: 1_200, deductions: [] });
  const worked = [
    sample("demo-worked-1", CAMPUS, weekStart, "07:00", "11:00", 1_250),
    sample("demo-worked-2", CAFE, addDays(weekStart, 1), "07:00", "12:00", 1_100),
    sample("demo-worked-3", CAMPUS, addDays(weekStart, 2), "07:00", "11:00", 1_250),
  ].filter((entry) => entry.endsAt <= now);
  const previous = [sample("demo-previous", CAMPUS, addDays(weekStart, -7), "07:00", "15:00", 1_250)];
  const upcoming = sample(shift.id, CAMPUS, friday, "11:00", "14:00", 1_250);
  const sampleShifts = [...previous, ...worked, upcoming];
  const jobs = allocateWeekMinutes(demoDashboard.jobs.map((job) => ({ ...job, weekly_limit_minutes: job.weeklyLimitMinutes })), sampleShifts, now, timeZone, 0).map((job) => ({ ...job, weeklyLimitMinutes: job.weekly_limit_minutes }));

  // The month `back` months before this one, at UTC noon on the 15th.
  const monthAt = (back: number) => new Date(Date.UTC(year, month - 1 - back, 15, 12));
  const key = (date: Date) => date.toISOString().slice(0, 7);
  const label = (date: Date, withYear: boolean) => formatInTimeZone(date, "UTC", withYear ? "MMM yyyy" : "MMM");
  const totalMonths = demoDashboard.totals.months;
  const chartMonths = demoDashboard.monthlyJobAllocation.months;

  return {
    ...demoDashboard,
    ...buildDashboardInsights(sampleShifts, now, timeZone, 0),
    recentShifts: recentCompletedShifts(sampleShifts, now, timeZone),
    jobs,
    loggedMinutes: jobs.reduce((total, job) => total + job.usedMinutes, 0),
    scheduledMinutes: jobs.reduce((total, job) => total + job.scheduledMinutes, 0),
    upcomingShifts: [shift],
    totals: {
      ...demoDashboard.totals,
      week: combineMonthTotals(bucketWorkedShiftsByMonth(worked, now, timeZone)),
      months: totalMonths.map((entry, index) => {
        const date = monthAt(totalMonths.length - 1 - index);
        return { ...entry, key: key(date), label: label(date, true) };
      }),
    },
    monthlyJobAllocation: {
      ...demoDashboard.monthlyJobAllocation,
      months: chartMonths.map((entry, index) => {
        const date = monthAt(chartMonths.length - 1 - index);
        return { ...entry, key: key(date), label: label(date, false) };
      }),
    },
  };
}
