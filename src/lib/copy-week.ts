import { formatInTimeZone, fromZonedTime } from "date-fns-tz";
import type { BreakPeriod } from "./break-periods";
import { checkOccurrences, type ExistingShift } from "./limit-check";
import { addWeeksToLocalDateTime } from "./shift-date-time";

/**
 * "Copy to next week" on the shift log: every shift that starts in one week,
 * the same job, the same local wall-clock times, seven days later.
 *
 * This file is the pure half. It moves the times and decides, before anything
 * is written, which copies the database would accept, using `checkOccurrences`
 * (the mirror of `enforce_shift_weekly_limits` and `shifts_no_overlap`). The
 * action (`copyWeekToNext` in `src/app/actions/work.ts`) then inserts the
 * accepted ones one at a time through the same path as Add shift, so the
 * triggers still judge each one and a refusal skips that shift, never the rest.
 */

/**
 * A week with more shifts than this is refused as a whole rather than half
 * copied. No real week comes close (it would mean shifts of under three hours
 * around the clock), so hitting it means something odd, and it bounds the
 * inserts one click can make.
 */
export const COPY_WEEK_MAX_SHIFTS = 60;

export type CopySource = {
  id: string;
  jobId: string;
  startsAt: Date;
  endsAt: Date;
  notes: string | null;
  job: { archived: boolean; weeklyLimitMinutes: number | null };
};

/** Why a shift was not copied. The planner gives the first five; the database can add the rest. */
export type CopySkipReason = "archived-job" | "past" | "bad-span" | "overlap" | "global-limit" | "job-limit" | "not-saved";

export type CopyPlanItem = {
  source: CopySource;
  /** Where the copy lands; null only when the time could not be worked out. */
  startsAt: Date | null;
  endsAt: Date | null;
  skip: CopySkipReason | null;
};

/**
 * The same local wall-clock time `weeks` weeks later, in `timeZone`. Through
 * the local calendar rather than by adding 168 hours, so 9:00 stays 9:00 across
 * a daylight-saving change. A time that does not exist on the new day (inside
 * the spring-forward gap) comes out as `fromZonedTime` resolves it, an hour
 * later, exactly as Add shift's weekly repeat does.
 */
export function shiftLocalByWeeks(instant: Date, timeZone: string, weeks: number): Date | null {
  const moved = addWeeksToLocalDateTime(formatInTimeZone(instant, timeZone, "yyyy-MM-dd'T'HH:mm"), weeks);
  return moved ? fromZonedTime(moved, timeZone) : null;
}

const DAY_MS = 86_400_000;

/**
 * Decide which copies would be accepted, in start order. Each end moves on its
 * own local date, so an overnight shift stays overnight; across a clock change
 * it can come out an hour longer or shorter, as the wall clock says it should.
 *
 * An accepted copy counts toward the ones after it, as it will once inserted,
 * so two copies cannot each fit a cap that only one of them fits. `existing`
 * is every shift touching the weeks the copies land in (archived jobs'
 * included, because the trigger counts them).
 */
export function planWeekCopy({ sources, existing, timeZone, weekStartsOn, globalLimit, breakPeriods = [], now, weeks = 1 }: {
  sources: readonly CopySource[];
  existing: readonly ExistingShift[];
  timeZone: string;
  weekStartsOn: number;
  globalLimit: number | null;
  breakPeriods?: readonly BreakPeriod[];
  now: Date;
  weeks?: number;
}): CopyPlanItem[] {
  const placed: ExistingShift[] = [...existing];
  const ordered = [...sources].sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime() || a.id.localeCompare(b.id));

  return ordered.map((source) => {
    const startsAt = shiftLocalByWeeks(source.startsAt, timeZone, weeks);
    const endsAt = shiftLocalByWeeks(source.endsAt, timeZone, weeks);
    const item = (skip: CopySkipReason | null): CopyPlanItem => ({ source, startsAt, endsAt, skip });

    if (source.job.archived) return item("archived-job");
    if (!startsAt || !endsAt) return item("bad-span");
    const span = endsAt.getTime() - startsAt.getTime();
    if (span <= 0 || span > DAY_MS) return item("bad-span");
    if (startsAt <= now) return item("past");

    const [check] = checkOccurrences({
      occurrences: [{ startsAt, endsAt }],
      jobId: source.jobId,
      existing: placed,
      timeZone,
      weekStartsOn,
      globalLimit,
      jobLimit: source.job.weeklyLimitMinutes,
      breakPeriods,
    });
    if (check.badSpan) return item("bad-span");
    if (check.overlap) return item("overlap");
    if (check.over === "global") return item("global-limit");
    if (check.over === "job") return item("job-limit");

    placed.push({ id: `copy-of-${source.id}`, jobId: source.jobId, startsAt, endsAt });
    return item(null);
  });
}

/**
 * A refused insert as a skip reason. Matches the same database messages as
 * `shiftDatabaseError` in the shift actions; anything unrecognised is
 * "not-saved" rather than a guess.
 */
export function copySkipFromDatabase(message: string): CopySkipReason {
  const normalized = message.toLowerCase();
  if (normalized.includes("global weekly limit")) return "global-limit";
  if (normalized.includes("job weekly limit")) return "job-limit";
  if (normalized.includes("shifts_no_duplicate_span") || normalized.includes("duplicate key") || normalized.includes("shifts_no_overlap") || normalized.includes("exclusion constraint")) return "overlap";
  if (normalized.includes("longer than zero") || normalized.includes("valid interval")) return "bad-span";
  return "not-saved";
}

const SKIP_LABELS: Record<CopySkipReason, string> = {
  "archived-job": "Its job is archived",
  past: "That time has already passed",
  "bad-span": "The clock change makes it longer than 24 hours",
  overlap: "Overlaps a shift already there",
  "global-limit": "Would go over your weekly limit",
  "job-limit": "Would go over this job’s weekly limit",
  "not-saved": "Couldn’t be saved",
};

export function copySkipLabel(reason: CopySkipReason) {
  return SKIP_LABELS[reason];
}

/** One copy as the dialog shows it: times already formatted in the viewer's zone. */
export type CopyWeekItem = {
  jobName: string;
  color: string;
  day: string;
  time: string;
  /** Weekday the copy ends on, when that is a later day. */
  endsOn: string | null;
  skip: CopySkipReason | null;
};

export type CopyWeekPreview =
  | { status: "ok"; targetRange: string; items: CopyWeekItem[] }
  | { status: "error"; message: string };

export type CopyWeekOutcome =
  | { status: "ok"; targetRange: string; created: number; items: CopyWeekItem[] }
  | { status: "error"; message: string };

/** "Copied 4 shifts", "Copied 1 shift. 2 skipped." */
export function copySummary(created: number, skipped: number) {
  const copied = created ? `Copied ${created} shift${created === 1 ? "" : "s"}` : "Nothing was copied";
  return skipped ? `${copied}. ${skipped} skipped.` : copied;
}
