/**
 * The public guides at `/guides/<slug>`: one page per question someone types
 * into a search box before they know ShiftSentry exists. The landing's footer,
 * the sitemap and `/llms.txt` list them from here.
 *
 * The landing's rule holds here too: every behaviour a guide describes is one
 * the app or the database enforces (the 80/90/100 ladder, the per-job cap, the
 * midnight split and 24 hour limit, the overlap constraint, the pay snapshot,
 * percentage tax and deductions, pay schedules). Change a guide in the same
 * change as its rule. Nothing here may read as legal, immigration or tax
 * advice: ShiftSentry does not know which limit applies to anyone.
 */
export type GuideSection = { heading: string; paragraphs: string[] };
export type Guide = {
  slug: string;
  /** The footer link's text. */
  navLabel: string;
  /** The `<title>`, before "| ShiftSentry". */
  title: string;
  description: string;
  heading: string;
  lede: string;
  sections: GuideSection[];
  /** The date the text last changed, for the sitemap and the Article data. */
  updated: string;
};

export const GUIDES: Guide[] = [
  {
    slug: "track-hours-across-multiple-jobs",
    navLabel: "Tracking hours across jobs",
    title: "How to track work hours across more than one job",
    description: "Keep one running total of your hours across every part-time job, with planned shifts counted before you work them and overnight shifts split at midnight.",
    heading: "Tracking work hours across more than one job",
    lede: "With two or three part-time jobs, each employer only sees its own hours. The total across all of them is the number you have to keep yourself, and it is the one most limits apply to.",
    updated: "2026-11-02",
    sections: [
      {
        heading: "Why the total matters",
        paragraphs: [
          "A campus job and a weekend job can each look reasonable on their own schedule and still add up to more than you meant to work. Many hour limits are written against your total hours in a week, not against any one job: a cap from your school or visa, a rule attached to a benefit, or simply the most you can work and still keep up with class.",
          "ShiftSentry doesn't know which of those applies to you. You enter the limit, and it keeps the total.",
        ],
      },
      {
        heading: "Set up each job once",
        paragraphs: [
          "Add each job with its hourly rate, the tax rate you want it estimated at, and any percentage deductions. Then set one weekly limit that covers every job, and pick the day your week starts. It can be any day of the week, and the week is counted in your own time zone.",
          "If one employer also caps your hours, give that job its own weekly cap. A shift has to fit under both: the overall limit and its job's cap.",
        ],
      },
      {
        heading: "Log shifts before you work them",
        paragraphs: [
          "A planned shift counts toward its week the moment you save it. Schedule Friday on Monday and Monday's total already includes it, so you find out about a conflict while you can still turn the shift down.",
          "Two shifts can't overlap, even at different jobs, which catches the double-booking that is easy to miss when each job keeps its own schedule. Back-to-back shifts are fine.",
        ],
      },
      {
        heading: "Overnight shifts",
        paragraphs: [
          "A shift that runs past midnight is split there. The hours before midnight count toward the first day and the rest toward the next, in your own time zone. If midnight is also where your week turns over, each part lands in its own week. A single shift can run up to 24 hours.",
        ],
      },
      {
        heading: "What you see each week",
        paragraphs: [
          "The dashboard shows logged and planned hours against your limit, how close each job is to its own cap, your next shift, and estimated pay by job, with the last six months alongside. On a phone, ShiftSentry installs to the home screen like an app.",
        ],
      },
    ],
  },
  {
    slug: "stay-under-weekly-hour-limit",
    navLabel: "Staying under a weekly limit",
    title: "How to stay under a weekly work-hour limit",
    description: "Count logged and planned shifts against a weekly hour limit, get warned at 80% and 90%, and have any shift that would push you over refused.",
    heading: "Staying under a weekly work-hour limit",
    lede: "Going over a weekly limit usually happens one extra shift at a time, and you only find out once the week is over. The fix is to count the week as you plan it, not after you have worked it.",
    updated: "2026-11-02",
    sections: [
      {
        heading: "What counts toward the week",
        paragraphs: [
          "Every shift in the week counts, at every job: the ones you've worked and the ones you've only scheduled. Your week starts on the day you choose and is counted in your own time zone. A shift that runs past midnight is split there, so each part counts on its own day, and in its own week if the week turns over at that midnight.",
        ],
      },
      {
        heading: "Warnings before the limit",
        paragraphs: [
          "ShiftSentry warns you when the week reaches 80% of your limit and again at 90%. On a 20 hour limit, that's at 16 hours and at 18 hours, early enough to say no to the next extra shift.",
          "The shift form checks the limit as you fill it in, so you see whether a shift fits before you save it.",
        ],
      },
      {
        heading: "A shift that would go over is refused",
        paragraphs: [
          "At 100% the limit stops being a warning. A shift that would take the week past your limit isn't saved, and the database refuses it as well, so the rule holds whichever way the shift arrives.",
          "Take a 20 hour limit with 16 hours already planned. A 5 hour Saturday shift would make 21, one hour over, so it is refused. A 4 hour shift fits exactly.",
          "If a job has its own weekly cap, the same check runs against that job's hours too. The overall limit is checked first.",
        ],
      },
      {
        heading: "Choosing the number",
        paragraphs: [
          "Set the limit to whatever applies to you, whether that's a rule from your school, visa, employer or your own budget of time. ShiftSentry enforces the number you give it; it doesn't know the rules behind it, and its warnings aren't legal, immigration or employment advice. Check its totals against your employers' records.",
        ],
      },
    ],
  },
  {
    slug: "estimate-take-home-pay-per-shift",
    navLabel: "Estimating take-home pay",
    title: "How to estimate take-home pay for each shift",
    description: "Estimate net pay per shift from the hourly rate, tax and deductions you set for each job, with every shift keeping the rate it was worked at.",
    heading: "Estimating take-home pay for each shift",
    lede: "Hours are only half of what you want to know about a week. The other half is what those hours will actually pay once tax and deductions come out.",
    updated: "2026-11-02",
    sections: [
      {
        heading: "How the estimate is worked out",
        paragraphs: [
          "Each job has an hourly rate, a tax rate and any number of named deductions, each a percentage of gross pay. For a shift, gross pay is the rate times the time worked. Tax and each deduction are taken from gross, and what's left is the estimate of take-home pay.",
          "For example, a 4 hour shift at $15.00 an hour is $60.00 gross. With 10% tax and a 5% deduction, $6.00 and $3.00 come off, leaving $51.00.",
        ],
      },
      {
        heading: "Each shift keeps its own rate",
        paragraphs: [
          "When you change a job's rate, shifts you've already worked don't change. Every shift keeps the rate, tax and deductions it was saved with, so a raise next month doesn't rewrite last month's pay.",
        ],
      },
      {
        heading: "Totals by week, month and pay period",
        paragraphs: [
          "The dashboard adds the estimates up as net pay by job for the week, with month totals for the last six months. Overnight shifts are split at midnight here as well, so each day's pay lands in the week and month it belongs to.",
          "If you give a job its pay schedule, every so many weeks or on a set day each month, ShiftSentry also shows what you've earned so far in the current pay period and what the previous one came to.",
        ],
      },
      {
        heading: "An estimate, not a payslip",
        paragraphs: [
          "The numbers come from the rates you enter, so they are only as close as those rates are. Your employer's payslip is the record; real withholding can differ from a flat percentage, and ShiftSentry isn't tax or financial advice.",
        ],
      },
    ],
  },
];

export function guideBySlug(slug: string) {
  return GUIDES.find((guide) => guide.slug === slug) ?? null;
}
