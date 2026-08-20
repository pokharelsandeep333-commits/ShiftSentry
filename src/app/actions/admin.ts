"use server";
import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { createAdminSupabaseClient } from "@/lib/supabase/server";
import { prisma } from "@/lib/prisma";

export async function setAccountDisabled(formData: FormData) { const actor = await requireAdmin(); const userId = String(formData.get("userId")); const disabled = String(formData.get("disabled")) === "true"; const admin = createAdminSupabaseClient(); const { error } = await admin.from("profiles").update({ disabled_at: disabled ? new Date().toISOString() : null }).eq("id", userId); if (error) throw error; await admin.auth.admin.updateUserById(userId, { ban_duration: disabled ? "876000h" : "none" }); await prisma.auditEvent.create({ data: { actorId: actor.id, targetUserId: userId, action: disabled ? "account.disabled" : "account.enabled" } }); revalidatePath("/admin"); revalidatePath(`/admin/users/${userId}`); }

export async function sendPasswordReset(formData: FormData) { const actor = await requireAdmin(); const userId = String(formData.get("userId")); const user = await prisma.profile.findUnique({ where: { id: userId }, select: { email: true } }); if (!user) throw new Error("User not found."); const { error } = await createAdminSupabaseClient().auth.resetPasswordForEmail(user.email); if (error) throw error; await prisma.auditEvent.create({ data: { actorId: actor.id, targetUserId: userId, action: "account.password_reset_requested" } }); revalidatePath(`/admin/users/${userId}`); }
