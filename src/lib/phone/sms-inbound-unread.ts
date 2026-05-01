import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { supabaseAdmin } from "@/lib/admin";

/** PostgREST default max rows per request; paginate so unread totals are not truncated. */
const UNREAD_COUNT_PAGE_SIZE = 1000;

/**
 * Count inbound messages with viewed_at IS NULL per conversation (unread from patient).
 * Excludes `message_type = 'voicemail'` so voicemail thread cards do not light up SMS unread / nav.
 * Uses the service role and paginates so counts stay correct past the default row limit.
 * `supabase` is kept for call-site compatibility; the query uses `supabaseAdmin` so counts
 * match RLS-safe conversation lists and are not capped at 1000 rows.
 */
export async function countUnreadInboundByConversationIds(
  _supabase: SupabaseClient,
  conversationIds: string[],
  opts?: { restrictOwnerUserId?: string | null }
): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const id of conversationIds) out[id] = 0;
  if (conversationIds.length === 0) return out;

  const client = supabaseAdmin;
  let from = 0;

  for (;;) {
    let q = client
      .from("messages")
      .select("conversation_id")
      .in("conversation_id", conversationIds)
      .eq("direction", "inbound")
      .is("viewed_at", null)
      .is("deleted_at", null)
      .not("message_type", "eq", "voicemail")
      .order("id", { ascending: true })
      .range(from, from + UNREAD_COUNT_PAGE_SIZE - 1);

    const restrict = opts?.restrictOwnerUserId?.trim();
    if (restrict) {
      q = q.eq("owner_user_id", restrict);
    }

    if (error) {
      console.warn("[sms-unread] countUnreadInboundByConversationIds:", error.message);
      return out;
    }

    const rows = data ?? [];
    for (const row of rows) {
      const cid = typeof row.conversation_id === "string" ? row.conversation_id : "";
      if (cid) out[cid] = (out[cid] ?? 0) + 1;
    }

    if (rows.length < UNREAD_COUNT_PAGE_SIZE) break;
    from += UNREAD_COUNT_PAGE_SIZE;
  }

  if (process.env.SMS_UNREAD_DEBUG === "1") {
    const nonZero = Object.entries(out).filter(([, n]) => n > 0);
    console.warn("[sms-unread-debug] countUnreadInboundByConversationIds", {
      conversationIdFilters: conversationIds.length,
      nonZeroConversations: nonZero.length,
      sample: nonZero.slice(0, 12),
    });
  }

  return out;
}

/**
 * Mark all inbound messages in a thread as viewed (service role; RLS has no messages UPDATE for staff).
 */
export async function markInboundMessagesViewedForConversation(
  conversationId: string,
  viewer?: { userId: string; fullAccess: boolean }
): Promise<number> {
  const now = new Date().toISOString();
  let q = supabaseAdmin
    .from("messages")
    .update({ viewed_at: now })
    .eq("conversation_id", conversationId)
    .eq("direction", "inbound")
    .is("viewed_at", null)
    .is("deleted_at", null);

  if (viewer && !viewer.fullAccess) {
    q = q.eq("owner_user_id", viewer.userId);
  }

  const { data, error } = await q.select("id");

  if (error) {
    console.warn("[sms-unread] markInboundMessagesViewedForConversation:", error.message);
    return 0;
  }
  return data?.length ?? 0;
}
