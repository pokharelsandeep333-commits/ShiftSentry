import "server-only";
import { prisma } from "@/lib/prisma";
import { isGoogleCalendarEnabled } from "@/lib/google/config";

export type GoogleHealth = {
  /** "off": the flag is not set. "misconfigured": the flag is on but the client id, secret or key is missing or invalid. */
  feature: "on" | "off" | "misconfigured";
  connections: { active: number; needsReconnect: number };
  syncingJobs: number;
  accountsWithIssues: number;
  /** Sync refusals grouped by reason, most common first, with the latest time any account hit it. */
  issues: { reason: string; count: number; latest: Date }[];
};

/**
 * Google Calendar's state across all accounts, as counts. Sync issues are
 * stored per account with the job name and shift times (the user's own record,
 * shown on their Shifts page); this reads only each issue's reason, so the
 * admin view never shows whose shifts or which job.
 */
export async function getGoogleHealth(): Promise<GoogleHealth> {
  const flagOn = process.env.GOOGLE_CALENDAR_ENABLED === "true";
  const feature = !flagOn ? "off" : isGoogleCalendarEnabled() ? "on" : "misconfigured";

  const [byStatus, syncingJobs, withIssues] = await Promise.all([
    prisma.googleCalendarConnection.groupBy({ by: ["status"], _count: { _all: true } }),
    prisma.job.count({ where: { googleSync: true, archivedAt: null } }),
    prisma.googleCalendarConnection.findMany({ where: { NOT: { syncIssues: { equals: [] } } }, select: { syncIssues: true, updatedAt: true } }),
  ]);

  const connections = { active: 0, needsReconnect: 0 };
  for (const row of byStatus) {
    if (row.status === "needs_reconnect") connections.needsReconnect += row._count._all;
    else connections.active += row._count._all;
  }

  const reasons = new Map<string, { count: number; latest: Date }>();
  let accountsWithIssues = 0;
  for (const row of withIssues) {
    const list = Array.isArray(row.syncIssues) ? row.syncIssues : [];
    if (list.length) accountsWithIssues += 1;
    for (const issue of list) {
      const reason = typeof issue === "object" && issue && "reason" in issue && typeof issue.reason === "string" ? issue.reason : "Unknown";
      const entry = reasons.get(reason) ?? { count: 0, latest: row.updatedAt };
      entry.count += 1;
      if (row.updatedAt > entry.latest) entry.latest = row.updatedAt;
      reasons.set(reason, entry);
    }
  }

  return {
    feature,
    connections,
    syncingJobs,
    accountsWithIssues,
    issues: [...reasons.entries()].map(([reason, value]) => ({ reason, ...value })).sort((a, b) => b.count - a.count),
  };
}
