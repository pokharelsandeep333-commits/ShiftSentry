import "server-only";
import { prisma } from "@/lib/prisma";
import { AUDIT_WINDOW_DAYS } from "@/lib/admin-audit";
import { createAdminSupabaseClient } from "@/lib/supabase/server";

export type Check = { ok: boolean; ms: number | null; detail: string };

export type SystemHealth = {
  commit: string | null;
  uptimeSeconds: number;
  database: Check;
  auth: Check;
  retention: Check;
};

async function timed(run: () => Promise<unknown>): Promise<{ ok: boolean; ms: number }> {
  const started = performance.now();
  try {
    await run();
    return { ok: true, ms: Math.round(performance.now() - started) };
  } catch {
    return { ok: false, ms: Math.round(performance.now() - started) };
  }
}

/**
 * What the admin health page checks, each with how long it took. No error
 * text reaches the page: a driver or API error can carry a connection string
 * or a project URL, so a failure is reported as a failure and nothing more.
 *
 * Retention is checked by the oldest audit row: the daily purge deletes rows
 * past 30 days, so one much older than that means the job has stopped.
 */
export async function getSystemHealth(): Promise<SystemHealth> {
  const [database, auth, oldest] = await Promise.all([
    timed(() => prisma.$queryRaw`select 1`),
    timed(async () => {
      const { error } = await createAdminSupabaseClient().auth.admin.listUsers({ page: 1, perPage: 1 });
      if (error) throw new Error("auth");
    }),
    prisma.auditEvent.findFirst({ orderBy: { createdAt: "asc" }, select: { createdAt: true } }).catch(() => null),
  ]);

  const ageDays = oldest ? Math.floor((Date.now() - oldest.createdAt.getTime()) / 86_400_000) : null;
  const retentionOk = ageDays === null || ageDays <= AUDIT_WINDOW_DAYS + 1;

  return {
    commit: process.env.GIT_SHA || null,
    uptimeSeconds: Math.round(process.uptime()),
    database: { ...database, detail: database.ok ? "Responding to queries" : "Not responding" },
    auth: { ...auth, detail: auth.ok ? "Admin API responding" : "Admin API not responding" },
    retention: {
      ok: retentionOk,
      ms: null,
      detail: ageDays === null ? "No audit rows yet" : retentionOk ? `Oldest audit row is ${ageDays} day${ageDays === 1 ? "" : "s"} old` : `Oldest audit row is ${ageDays} days old: the daily cleanup may have stopped`,
    },
  };
}
