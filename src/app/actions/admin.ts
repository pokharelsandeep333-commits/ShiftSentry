"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth";
import { deleteAccountSafely } from "@/lib/account-deletion";
import { revokeStoredCalendarToken } from "@/lib/google/revoke-stored";
import { hasRecentAuthentication } from "@/lib/legal";
import { createAdminSupabaseClient, createServerSupabaseClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { resourceIdSchema } from "@/lib/validation";
import type { SavedFormState } from "@/lib/form-state";

/**
 * Admin actions return a message rather than throwing, so a refusal shows on
 * the form that was submitted instead of replacing the page with the error
 * screen. `savedAt` marks a success for the form to confirm.
 */
const fail = (message: string): SavedFormState => ({ message, savedAt: null });
const done = (): SavedFormState => ({ message: "", savedAt: Date.now() });

function targetUserId(formData: FormData) {
  const parsed = resourceIdSchema.safeParse(formData.get("userId"));
  return parsed.success ? parsed.data : null;
}

// The profile flag goes first because it is what the database enforces: RLS and
// the game functions read disabled_at, so the account is locked out the moment
// it commits, including through access tokens the ban below cannot recall. The
// ban then stops new sign-ins and refreshes. If it fails, the flag has still
// changed, so the audit row is written either way and the admin is told.
export async function setAccountDisabled(_previous: SavedFormState, formData: FormData): Promise<SavedFormState> {
  const actor = await requireAdmin();
  const userId = targetUserId(formData);
  if (!userId) return fail("Invalid user identifier.");
  // An admin who disables themself is locked out of the page that would undo it.
  if (userId === actor.id) return fail("You can't disable your own account.");
  const disabled = String(formData.get("disabled")) === "true";
  const admin = createAdminSupabaseClient();
  const { error } = await admin.from("profiles").update({ disabled_at: disabled ? new Date().toISOString() : null }).eq("id", userId);
  if (error) return fail("Unable to update the account status.");
  const { error: banError } = await admin.auth.admin.updateUserById(userId, { ban_duration: disabled ? "876000h" : "none" });
  await prisma.auditEvent.create({ data: { actorId: actor.id, targetUserId: userId, action: disabled ? "account.disabled" : "account.enabled", metadata: banError ? { authBanApplied: false } : {} } });
  revalidatePath("/admin");
  revalidatePath("/admin/users");
  revalidatePath(`/admin/users/${userId}`);
  if (banError) {
    console.error("Auth ban update failed:", banError);
    return fail(disabled ? "The account is disabled, but blocking its sign-in failed. Try again." : "The account is enabled, but lifting its sign-in block failed. Try again.");
  }
  return done();
}

/**
 * Limited to 3 per admin and account in 15 minutes. The limit is a count over
 * the audit rows this writes, so the rate limit and the audit trail are the
 * same record.
 */
export async function sendPasswordReset(_previous: SavedFormState, formData: FormData): Promise<SavedFormState> {
  const actor = await requireAdmin();
  const userId = targetUserId(formData);
  if (!userId) return fail("Invalid user identifier.");
  const user = await prisma.profile.findUnique({ where: { id: userId }, select: { email: true } });
  if (!user) return fail("User not found.");
  const recentRequests = await prisma.auditEvent.count({ where: { actorId: actor.id, targetUserId: userId, action: "account.password_reset_requested", createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) } } });
  if (recentRequests >= 3) return fail("Password reset requests are temporarily limited for this account. Try again in 15 minutes.");
  const { error } = await createAdminSupabaseClient().auth.resetPasswordForEmail(user.email);
  if (error) return fail("Unable to request a password reset.");
  await prisma.auditEvent.create({ data: { actorId: actor.id, targetUserId: userId, action: "account.password_reset_requested" } });
  revalidatePath(`/admin/users/${userId}`);
  return done();
}

/**
 * Ends every session the user has, through admin_revoke_user_sessions. Refresh
 * tokens go with their sessions, so nothing can be renewed; an access token
 * already issued lives until it expires (an hour at most), which the page says.
 * Not on yourself: the page you are on would stop working mid-click.
 */
export async function signOutEverywhere(_previous: SavedFormState, formData: FormData): Promise<SavedFormState> {
  const actor = await requireAdmin();
  const userId = targetUserId(formData);
  if (!userId) return fail("Invalid user identifier.");
  if (userId === actor.id) return fail("To end your own sessions, sign out instead.");
  const exists = await prisma.profile.count({ where: { id: userId } });
  if (!exists) return fail("User not found.");
  let removed: number;
  try {
    const rows = await prisma.$queryRaw<{ removed: number }[]>`select public.admin_revoke_user_sessions(${userId}::uuid) as removed`;
    removed = rows[0]?.removed ?? 0;
  } catch (error) {
    // The name only: a driver error message can carry the connection string.
    console.error("Session revocation failed:", error instanceof Error ? error.name : "unknown");
    return fail("Couldn't end their sessions. Try again.");
  }
  await prisma.auditEvent.create({ data: { actorId: actor.id, targetUserId: userId, action: "account.sessions_revoked", metadata: { sessions: removed } } });
  revalidatePath(`/admin/users/${userId}`);
  return done();
}

const noteSchema = z.object({ body: z.string().trim().min(1, "Write the note first.").max(2000, "Keep notes under 2,000 characters.") });

/**
 * A support note on an account. The audit row records that a note was added,
 * never what it says: the note is personal data with its own lifetime (it goes
 * with the account), and the audit log has another (30 days).
 */
export async function addSupportNote(_previous: SavedFormState, formData: FormData): Promise<SavedFormState> {
  const actor = await requireAdmin();
  const userId = targetUserId(formData);
  if (!userId) return fail("Invalid user identifier.");
  const parsed = noteSchema.safeParse({ body: formData.get("body") });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the note.");
  const exists = await prisma.profile.count({ where: { id: userId } });
  if (!exists) return fail("User not found.");
  await prisma.adminUserNote.create({ data: { userId, authorId: actor.id, body: parsed.data.body } });
  await prisma.auditEvent.create({ data: { actorId: actor.id, targetUserId: userId, action: "account.note_added" } });
  revalidatePath(`/admin/users/${userId}`);
  return done();
}

export async function deleteSupportNote(_previous: SavedFormState, formData: FormData): Promise<SavedFormState> {
  const actor = await requireAdmin();
  const parsed = resourceIdSchema.safeParse(formData.get("noteId"));
  if (!parsed.success) return fail("Invalid note identifier.");
  const note = await prisma.adminUserNote.findUnique({ where: { id: parsed.data }, select: { id: true, userId: true } });
  if (!note) return fail("That note has already been deleted.");
  await prisma.adminUserNote.delete({ where: { id: note.id } });
  await prisma.auditEvent.create({ data: { actorId: actor.id, targetUserId: note.userId, action: "account.note_deleted" } });
  revalidatePath(`/admin/users/${note.userId}`);
  return done();
}

const announcementSchema = z.object({
  message: z.string().trim().min(1, "Write the announcement first.").max(280, "Keep it under 280 characters."),
  tone: z.enum(["info", "warning"]),
});

/**
 * Posts the site banner, replacing whatever is live. The old notice is cleared
 * and the new one inserted in one transaction, so there is never a moment with
 * two (the database forbids it anyway) or with none mid-swap. Revalidating the
 * root layout puts it in front of everyone on their next page load.
 */
export async function postAnnouncement(_previous: SavedFormState, formData: FormData): Promise<SavedFormState> {
  const actor = await requireAdmin();
  const parsed = announcementSchema.safeParse({ message: formData.get("message"), tone: formData.get("tone") });
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Check the announcement.");
  const posted = await prisma.$transaction(async (tx) => {
    await tx.siteAnnouncement.updateMany({ where: { clearedAt: null }, data: { clearedAt: new Date(), clearedBy: actor.id } });
    return tx.siteAnnouncement.create({ data: { message: parsed.data.message, tone: parsed.data.tone, createdBy: actor.id }, select: { id: true } });
  });
  await prisma.auditEvent.create({ data: { actorId: actor.id, action: "announcement.posted", metadata: { announcement: posted.id, tone: parsed.data.tone } } });
  revalidatePath("/", "layout");
  return done();
}

export async function clearAnnouncement(): Promise<SavedFormState> {
  const actor = await requireAdmin();
  const { count } = await prisma.siteAnnouncement.updateMany({ where: { clearedAt: null }, data: { clearedAt: new Date(), clearedBy: actor.id } });
  if (!count) return fail("There is no live announcement.");
  await prisma.auditEvent.create({ data: { actorId: actor.id, action: "announcement.cleared" } });
  revalidatePath("/", "layout");
  return done();
}

/** A database refusal from the moderation functions, as a sentence for the admin. */
function moderationProblem(error: unknown) {
  const text = error instanceof Error ? error.message : "";
  if (text.includes("has ended")) return "That room has already ended.";
  if (text.includes("no longer in the room")) return "That player has already left the room.";
  console.error("Game moderation failed:", error instanceof Error ? error.name : "unknown");
  return "Couldn't do that. Refresh and try again.";
}

const roomIdSchema = resourceIdSchema;

/**
 * Imposter moderation (20261016130000_admin_game_moderation.sql). Each calls
 * one server-only function that does what the host's own control does, so
 * departures are settled and an ended room stays ended. The audit row holds
 * the room code and, for a player, their account, never the name that was
 * reset: that text may be the abuse, and the audit log is not where it should
 * be kept.
 */
export async function endGameRoomAsAdmin(_previous: SavedFormState, formData: FormData): Promise<SavedFormState> {
  const actor = await requireAdmin();
  const room = roomIdSchema.safeParse(formData.get("roomId"));
  if (!room.success) return fail("Invalid room.");
  const code = String(formData.get("code") ?? "").slice(0, 12);
  try {
    const rows = await prisma.$queryRaw<{ ended: boolean }[]>`select public.admin_end_game_room(${room.data}::uuid) as ended`;
    if (!rows[0]?.ended) return fail("That room has already ended.");
  } catch (error) {
    return fail(moderationProblem(error));
  }
  await prisma.auditEvent.create({ data: { actorId: actor.id, action: "game.room_ended", metadata: { room: code } } });
  revalidatePath("/admin/games");
  return done();
}

export async function removeGamePlayerAsAdmin(_previous: SavedFormState, formData: FormData): Promise<SavedFormState> {
  const actor = await requireAdmin();
  const room = roomIdSchema.safeParse(formData.get("roomId"));
  const userId = targetUserId(formData);
  if (!room.success || !userId) return fail("Invalid room or player.");
  const code = String(formData.get("code") ?? "").slice(0, 12);
  try {
    await prisma.$queryRaw`select public.admin_remove_game_player(${room.data}::uuid, ${userId}::uuid)`;
  } catch (error) {
    return fail(moderationProblem(error));
  }
  await prisma.auditEvent.create({ data: { actorId: actor.id, targetUserId: userId, action: "game.player_removed", metadata: { room: code } } });
  revalidatePath("/admin/games");
  return done();
}

export async function resetGameNameAsAdmin(_previous: SavedFormState, formData: FormData): Promise<SavedFormState> {
  const actor = await requireAdmin();
  const room = roomIdSchema.safeParse(formData.get("roomId"));
  const userId = targetUserId(formData);
  if (!room.success || !userId) return fail("Invalid room or player.");
  const code = String(formData.get("code") ?? "").slice(0, 12);
  try {
    await prisma.$queryRaw`select public.admin_reset_game_name(${room.data}::uuid, ${userId}::uuid)`;
  } catch (error) {
    return fail(moderationProblem(error));
  }
  await prisma.auditEvent.create({ data: { actorId: actor.id, targetUserId: userId, action: "game.name_reset", metadata: { room: code } } });
  revalidatePath("/admin/games");
  return done();
}

/**
 * Deletes an account on the holder's request (docs/privacy-operations.md:
 * verify the request first). The same sequence as self-deletion, through the
 * same tested deleteAccountSafely: lock, end sessions, revoke Google (best
 * effort), delete the Auth user, whose cascade removes everything else. A
 * failure after the lock leaves the account locked, never unlocked; running
 * this again finishes it.
 *
 * Guarded four ways: the admin typed the account's email, signed in within the
 * last 10 minutes (as self-deletion requires), is not deleting themself, and
 * is not deleting another admin. At most 5 per admin per hour, counted from
 * the audit rows this writes. The audit row is written before deletion starts,
 * so even a half-finished attempt is on record; the deletion cleanup then
 * strips it to who acted and when.
 */
export async function deleteAccountAsAdmin(_previous: SavedFormState, formData: FormData): Promise<SavedFormState> {
  const actor = await requireAdmin();
  const userId = targetUserId(formData);
  if (!userId) return fail("Invalid user identifier.");
  if (userId === actor.id) return fail("Delete your own account from Account and privacy instead.");
  const target = await prisma.profile.findUnique({ where: { id: userId }, select: { email: true, role: true } });
  if (!target) return fail("This account no longer exists.");
  if (target.role === "ADMIN") return fail("Admin accounts can't be deleted here. Remove the email from ADMIN_EMAIL_ALLOWLIST first, then ask them to delete it themselves.");
  const typed = String(formData.get("confirmEmail") ?? "").trim().toLowerCase();
  if (typed !== target.email.toLowerCase()) return fail("Type the account's email exactly to confirm.");

  const { data: verified, error: claimsError } = await (await createServerSupabaseClient()).auth.getClaims();
  if (claimsError || verified?.claims.sub !== actor.id) return fail("Sign in again before deleting an account.");
  if (!hasRecentAuthentication(verified.claims)) return fail("For safety, sign out and sign in again, then come back within 10 minutes.");

  const recent = await prisma.auditEvent.count({ where: { actorId: actor.id, action: "account.deleted_by_admin", createdAt: { gte: new Date(Date.now() - 60 * 60 * 1000) } } });
  if (recent >= 5) return fail("You've deleted 5 accounts in the last hour. Wait before deleting more.");

  await prisma.auditEvent.create({ data: { actorId: actor.id, targetUserId: userId, action: "account.deleted_by_admin" } });
  const admin = createAdminSupabaseClient();
  const result = await deleteAccountSafely({
    lock: async () => {
      const { error } = await admin.rpc("prepare_account_deletion", { p_user_id: userId });
      if (error) throw new Error("Deletion lock failed.");
    },
    revokeSessions: async () => {
      await prisma.$queryRaw`select public.admin_revoke_user_sessions(${userId}::uuid)`;
    },
    revokeCalendar: () => revokeStoredCalendarToken(admin, userId),
    deleteAccount: async () => {
      const { error } = await admin.auth.admin.deleteUser(userId, false);
      if (error) throw new Error("Auth deletion failed.");
    },
  });
  revalidatePath("/admin");
  revalidatePath("/admin/users");
  if (result.status === "failed") return fail("Deletion didn't start, and nothing was changed. Try again.");
  if (result.status === "locked") {
    revalidatePath(`/admin/users/${userId}`);
    return fail("Deletion started but didn't finish. The account stays locked; run Delete again to finish it.");
  }
  redirect("/admin/users?deleted=1");
}
