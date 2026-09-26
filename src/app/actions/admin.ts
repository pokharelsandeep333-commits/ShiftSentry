"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { resourceIdSchema } from "@/lib/validation";

function targetUserId(formData: FormData) { const parsed = resourceIdSchema.safeParse(formData.get("userId")); if (!parsed.success) throw new Error("Invalid user identifier."); return parsed.data; }

// The profile flag goes first because it is what the database enforces: RLS and
// the game functions read disabled_at, so the account is locked out the moment
// it commits, including through access tokens the ban below cannot recall. The
// ban then stops new sign-ins and refreshes. If it fails, the flag has still
// changed, so the audit row is written either way and the admin is told.
export async function setAccountDisabled(formData: FormData) {
  const actor = await requireAdmin();
  const userId = targetUserId(formData);
  const disabled = String(formData.get("disabled")) === "true";
  const admin = createAdminSupabaseClient();
  const { error } = await admin.from("profiles").update({ disabled_at: disabled ? new Date().toISOString() : null }).eq("id", userId);
  if (error) throw new Error("Unable to update the account status.");
  const { error: banError } = await admin.auth.admin.updateUserById(userId, { ban_duration: disabled ? "876000h" : "none" });
  await prisma.auditEvent.create({ data: { actorId: actor.id, targetUserId: userId, action: disabled ? "account.disabled" : "account.enabled", metadata: banError ? { authBanApplied: false } : {} } });
  revalidatePath("/admin");
  revalidatePath(`/admin/users/${userId}`);
  if (banError) {
    console.error("Auth ban update failed:", banError);
    throw new Error(disabled ? "The account is disabled, but blocking its sign-in failed. Try again." : "The account is enabled, but lifting its sign-in block failed. Try again.");
  }
}

export async function sendPasswordReset(formData: FormData) { const actor = await requireAdmin(); const userId = targetUserId(formData); const user = await prisma.profile.findUnique({ where: { id: userId }, select: { email: true } }); if (!user) throw new Error("User not found."); const recentRequests = await prisma.auditEvent.count({ where: { actorId: actor.id, targetUserId: userId, action: "account.password_reset_requested", createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) } } }); if (recentRequests >= 3) throw new Error("Password reset requests are temporarily limited for this account."); const { error } = await createAdminSupabaseClient().auth.resetPasswordForEmail(user.email); if (error) throw new Error("Unable to request a password reset."); await prisma.auditEvent.create({ data: { actorId: actor.id, targetUserId: userId, action: "account.password_reset_requested" } }); revalidatePath(`/admin/users/${userId}`); }
