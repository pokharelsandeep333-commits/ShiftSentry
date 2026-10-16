import "server-only";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { AuditFilters } from "@/lib/admin-audit";

export type AuditRow = {
  id: string;
  action: string;
  createdAt: Date;
  actor: string | null;
  targetUserId: string | null;
  /** The target's email, "a deleted account" when it is gone, or null when the event had no target. */
  target: string | null;
};

/**
 * Audit events with people's emails in place of ids. The actor comes through
 * the relation; targets have no relation (a target can be any account), so
 * they are looked up in one query. A target whose profile is gone was deleted.
 */
export async function loadAuditRows(args: { where?: Prisma.AuditEventWhereInput; take: number; skip?: number }): Promise<AuditRow[]> {
  const events = await prisma.auditEvent.findMany({ where: args.where, take: args.take, skip: args.skip, orderBy: { createdAt: "desc" }, include: { actor: { select: { email: true } } } });
  const targetIds = [...new Set(events.map((event) => event.targetUserId).filter((id): id is string => Boolean(id)))];
  const targets = targetIds.length ? await prisma.profile.findMany({ where: { id: { in: targetIds } }, select: { id: true, email: true } }) : [];
  const emails = new Map(targets.map((profile) => [profile.id, profile.email]));
  return events.map((event) => ({
    id: event.id,
    action: event.action,
    createdAt: event.createdAt,
    actor: event.actor?.email ?? null,
    targetUserId: event.targetUserId,
    target: event.targetUserId ? emails.get(event.targetUserId) ?? "a deleted account" : null,
  }));
}

/**
 * The query for a set of audit filters. The target filter matches account
 * emails first and then their events, so a deleted account (no profile left)
 * cannot be found by email, only seen in the unfiltered log.
 */
export async function auditWhere(filters: AuditFilters, now = new Date()): Promise<Prisma.AuditEventWhereInput> {
  const where: Prisma.AuditEventWhereInput = { createdAt: { gte: new Date(now.getTime() - filters.days * 86_400_000) } };
  if (filters.action) where.action = filters.action;
  if (filters.actor) where.actorId = filters.actor;
  if (filters.target) {
    const matches = await prisma.profile.findMany({ where: { email: { contains: filters.target, mode: "insensitive" } }, select: { id: true }, take: 50 });
    where.targetUserId = { in: matches.map((profile) => profile.id) };
  }
  return where;
}
