"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";
import { resourceIdSchema } from "@/lib/validation";

function targetUserId(formData: FormData) { const parsed = resourceIdSchema.safeParse(formData.get("userId")); if (!parsed.success) throw new Error("Invalid user identifier."); return parsed.data; }

export async function setAccountDisabled(formData: FormData) { const actor = await requireAdmin(); const userId = targetUserId(formData); const disabled = String(formData.get("disabled")) === "true"; const admin = createAdminSupabaseClient(); const { error } = await admin.from("profiles").update({ disabled_at: disabled ? new Date().toISOString() : null }).eq("id", userId); if (error) throw new Error("Unable to update the account status."); await admin.auth.admin.updateUserById(userId, { ban_duration: disabled ? "876000h" : "none" }); await prisma.auditEvent.create({ data: { actorId: actor.id, targetUserId: userId, action: disabled ? "account.disabled" : "account.enabled" } }); revalidatePath("/admin"); revalidatePath(`/admin/users/${userId}`); }

export async function sendPasswordReset(formData: FormData) { const actor = await requireAdmin(); const userId = targetUserId(formData); const user = await prisma.profile.findUnique({ where: { id: userId }, select: { email: true } }); if (!user) throw new Error("User not found."); const recentRequests = await prisma.auditEvent.count({ where: { actorId: actor.id, targetUserId: userId, action: "account.password_reset_requested", createdAt: { gte: new Date(Date.now() - 15 * 60 * 1000) } } }); if (recentRequests >= 3) throw new Error("Password reset requests are temporarily limited for this account."); const { error } = await createAdminSupabaseClient().auth.resetPasswordForEmail(user.email); if (error) throw new Error("Unable to request a password reset."); await prisma.auditEvent.create({ data: { actorId: actor.id, targetUserId: userId, action: "account.password_reset_requested" } }); revalidatePath(`/admin/users/${userId}`); }
