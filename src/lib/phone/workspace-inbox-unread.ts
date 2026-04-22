import type { SupabaseClient } from "@supabase/supabase-js";

import { countUnreadInboundByConversationIds } from "@/lib/phone/sms-inbound-unread";
import type { StaffProfile } from "@/lib/staff-profile";
import { hasFullCallVisibility } from "@/lib/staff-profile";

const INBOX_CONVERSATION_LIMIT = 80;

/**
 * Whether the staff member has at least one unread inbound SMS in their workspace inbox scope
 * (same conversation visibility as `/workspace/phone/inbox` without search filtering).
 */
export async function workspaceInboxHasUnreadInbound(
  staff: StaffProfile,
  supabase: SupabaseClient
): Promise<boolean> {
  const hasFull = hasFullCallVisibility(staff);
  let q = supabase
    .from("conversations")
    .select("id")
    .eq("channel", "sms")
    .is("deleted_at", null)
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(INBOX_CONVERSATION_LIMIT);

  if (!hasFull) {
    q = q.or(`assigned_to_user_id.eq.${staff.user_id},assigned_to_user_id.is.null`);
  }

  const { data: convRows, error } = await q;
  if (error) {
    console.warn("[workspace-inbox-unread] list:", error.message);
    return false;
  }

  const ids = (convRows ?? [])
    .map((r) => (typeof r.id === "string" ? r.id : ""))
    .filter(Boolean);
  if (ids.length === 0) return false;

  const unreadByConvId = await countUnreadInboundByConversationIds(supabase, ids);
  return Object.values(unreadByConvId).some((n) => (n ?? 0) > 0);
}
