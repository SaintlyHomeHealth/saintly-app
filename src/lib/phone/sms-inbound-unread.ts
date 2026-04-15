import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { supabaseAdmin } from "@/lib/admin";

/**
 * Count inbound messages with viewed_at IS NULL per conversation (unread from patient).
 */
export async function countUnreadInboundByConversationIds(
  supabase: SupabaseClient,
  conversationIds: string[]
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const id of conversationIds) out[id] = 0;
  if (conversationIds.length === 0) return out;

  const { data, error } = await supabase
    .from("messages")
    .select("conversation_id")
    .in("conversation_id", conversationIds)
    .eq("direction", "inbound")
    .is("viewed_at", null);

  if (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[sms-unread] countUnreadInboundByConversationIds:", error.message);
    }
    return out;
  }

  for (const row of data ?? []) {
    const cid = typeof row.conversation_id === "string" ? row.conversation_id : "";
    if (cid) out[cid] = (out[cid] ?? 0) + 1;
  }
  return out;
}

/**
 * Mark all inbound messages in a thread as viewed (service role; RLS has no messages UPDATE for staff).
 */
export async function markInboundMessagesViewedForConversation(conversationId: string): Promise<number> {
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from("messages")
    .update({ viewed_at: now })
    .eq("conversation_id", conversationId)
    .eq("direction", "inbound")
    .is("viewed_at", null)
    .select("id");

  if (error) {
    console.warn("[sms-unread] markInboundMessagesViewedForConversation:", error.message);
    return 0;
  }
  return data?.length ?? 0;
}
