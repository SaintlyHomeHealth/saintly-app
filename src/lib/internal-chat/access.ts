import "server-only";

import { supabaseAdmin } from "@/lib/admin";

export type InternalChatMemberRole = "admin" | "staff" | "read_only";

export async function assertInternalChatMember(
  chatId: string,
  userId: string
): Promise<{ member_role: InternalChatMemberRole } | null> {
  const { data, error } = await supabaseAdmin
    .from("internal_chat_members")
    .select("member_role")
    .eq("chat_id", chatId)
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    console.warn("[internal-chat] assertInternalChatMember:", error.message);
    return null;
  }
  if (!data?.member_role) {
    return null;
  }
  return { member_role: data.member_role as InternalChatMemberRole };
}

export async function canPostToInternalChat(
  chatId: string,
  userId: string
): Promise<boolean> {
  const m = await assertInternalChatMember(chatId, userId);
  return Boolean(m && m.member_role !== "read_only");
}
