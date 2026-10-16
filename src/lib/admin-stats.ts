import "server-only";
import { prisma } from "@/lib/prisma";
import { LEGAL_VERSION } from "@/lib/legal";
import { fillBuckets, lastUtcDays, lastUtcWeeks } from "@/lib/admin-usage";

const DAY_MS = 86_400_000;

export type UsageStats = {
  accounts: number;
  disabled: number;
  pendingDeletion: number;
  activeThisWeek: number;
  shiftsLast30Days: number;
  acceptedCurrentTerms: number;
  google: { active: number; needsReconnect: number };
  signupsByWeek: { key: string; count: number }[];
  shiftsByDay: { key: string; count: number }[];
};

/**
 * Platform totals for the admin overview. Every number is an aggregate over
 * all accounts; nothing here returns a row about one person, which is what the
 * Privacy Policy's "account details and work summaries" allows an admin.
 *
 * "Active" means added a shift in the last 7 days. Sign-in times live in the
 * Auth schema, which this client does not read, and a shift is the thing the
 * app is for. The date buckets are UTC (see admin-usage.ts). Raw SQL only for
 * the date_trunc grouping Prisma cannot express, and always as a tagged
 * template, so every value is a bound parameter.
 */
export async function getUsageStats(now = new Date()): Promise<UsageStats> {
  const weeks = lastUtcWeeks(now, 12);
  const days = lastUtcDays(now, 30);
  const weeksSince = new Date(`${weeks[0]}T00:00:00Z`);
  const daysSince = new Date(`${days[0]}T00:00:00Z`);
  const activeSince = new Date(now.getTime() - 7 * DAY_MS);

  const [accounts, disabled, pendingDeletion, acceptedCurrentTerms, googleByStatus, active, shiftsLast30Days, signups, shifts] = await Promise.all([
    prisma.profile.count(),
    prisma.profile.count({ where: { disabledAt: { not: null } } }),
    prisma.profile.count({ where: { deletionPendingAt: { not: null } } }),
    prisma.legalAcceptance.count({ where: { version: LEGAL_VERSION } }),
    prisma.googleCalendarConnection.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.$queryRaw<{ count: number }[]>`select count(distinct user_id)::int as count from public.shifts where created_at >= ${activeSince}`,
    prisma.shift.count({ where: { createdAt: { gte: daysSince } } }),
    prisma.$queryRaw<{ bucket: string; count: number }[]>`select to_char(date_trunc('week', created_at at time zone 'UTC'), 'YYYY-MM-DD') as bucket, count(*)::int as count from public.profiles where created_at >= ${weeksSince} group by 1`,
    prisma.$queryRaw<{ bucket: string; count: number }[]>`select to_char(date_trunc('day', created_at at time zone 'UTC'), 'YYYY-MM-DD') as bucket, count(*)::int as count from public.shifts where created_at >= ${daysSince} group by 1`,
  ]);

  const google = { active: 0, needsReconnect: 0 };
  for (const row of googleByStatus) {
    if (row.status === "needs_reconnect") google.needsReconnect += row._count._all;
    else google.active += row._count._all;
  }

  return {
    accounts,
    disabled,
    pendingDeletion,
    activeThisWeek: active[0]?.count ?? 0,
    shiftsLast30Days,
    acceptedCurrentTerms,
    google,
    signupsByWeek: fillBuckets(weeks, signups),
    shiftsByDay: fillBuckets(days, shifts),
  };
}
