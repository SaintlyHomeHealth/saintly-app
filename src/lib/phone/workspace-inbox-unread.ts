import type { SupabaseClient } from "@supabase/supabase-js";

import {
  filterToSmsInboxConversationsInOrder,
  WORKSPACE_SMS_INBOX_CONVERSATION_FETCH,
  WORKSPACE_SMS_INBOX_MAX_VISIBLE,
} from "@/lib/phone/sms-inbox-conversation-scope";
import { countUnreadInboundByConversationIds } from "@/lib/phone/sms-inbound-unread";
import { routePerfStepsEnabled, routePerfTimed } from "@/lib/perf/route-perf";
import type { StaffProfile } from "@/lib/staff-profile";
import { hasFullCallVisibility } from "@/lib/staff-profile";

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
    .limit(WORKSPACE_SMS_INBOX_CONVERSATION_FETCH);

  if (!hasFull) {
    q = q.or(`assigned_to_user_id.eq.${staff.user_id},assigned_to_user_id.is.null`);
  }

  const { data: convRows, error } = routePerfStepsEnabled()
    ? await routePerfTimed("workspace_inbox_unread.conversations", () => q)
    : await q;
  if (error) {
    console.warn("[workspace-inbox-unread] list:", error.message);
    return false;
  }

  const scopeRows = (convRows ?? [])
    .map((r) => (typeof r.id === "string" ? { id: r.id } : null))
    .filter((x): x is { id: string } => Boolean(x));
  const inScope = routePerfStepsEnabled()
    ? await routePerfTimed("workspace_inbox_unread.scope", () =>
        filterToSmsInboxConversationsInOrder(supabase, scopeRows, WORKSPACE_SMS_INBOX_MAX_VISIBLE)
      )
    : await filterToSmsInboxConversationsInOrder(supabase, scopeRows, WORKSPACE_SMS_INBOX_MAX_VISIBLE);

  const ids = inScope.map((r) => r.id);
  if (ids.length === 0) return false;

  const unreadByConvId = routePerfStepsEnabled()
    ? await routePerfTimed("workspace_inbox_unread.counts", () => countUnreadInboundByConversationIds(supabase, ids))
    : await countUnreadInboundByConversationIds(supabase, ids);
  return Object.values(unreadByConvId).some((n) => (n ?? 0) > 0);
}
