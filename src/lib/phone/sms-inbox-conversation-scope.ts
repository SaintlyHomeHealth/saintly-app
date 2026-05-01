import type { SupabaseClient } from "@supabase/supabase-js";

/** Inbox only lists threads that have at least one real SMS row (`message_type = 'sms'`). */
const SMS_MESSAGE_TYPE = "sms" as const;

/**
 * Inbox and unread scope: over-fetch by this factor, then cull `voicemail`-only threads and cap.
 * Voicemail is stored on the same `conversations` row but must not appear as its own Inbox list entry.
 */
/** Hard render cap for workspace SMS inbox. */
export const WORKSPACE_SMS_INBOX_MAX_VISIBLE = 40;
/** Over-fetch for voicemail-thread culling; keep modest to speed first paint on mobile. */
export const WORKSPACE_SMS_INBOX_CONVERSATION_FETCH = 56;

export type SmsInboxConversationListRow = { id: string } & Record<string, unknown>;

type SmsConversationIdRow = { conversation_id: string | null };

async function loadConversationIdsWithSms(
  supabase: SupabaseClient,
  ids: string[]
): Promise<Set<string> | null> {
  const { data, error } = await supabase.rpc("sms_conversation_ids_with_messages", {
    conversation_ids: ids,
  });

  if (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[sms-inbox-conversation-scope] rpc unavailable:", error.message);
    }
    return null;
  }

  const withSms = new Set<string>();
  for (const row of (data ?? []) as SmsConversationIdRow[]) {
    const cid = typeof row.conversation_id === "string" ? row.conversation_id : "";
    if (cid) withSms.add(cid);
  }
  return withSms;
}

/**
 * Preserves the caller’s sort order, drops threads with no SMS messages (voicemail-only),
 * then takes the first `maxVisible` rows.
 */
export async function filterToSmsInboxConversationsInOrder(
  supabase: SupabaseClient,
  conversationRows: SmsInboxConversationListRow[],
  maxVisible: number
): Promise<SmsInboxConversationListRow[]> {
  if (conversationRows.length === 0 || maxVisible <= 0) return [];

  const ids = conversationRows.map((r) => r.id);
  const rpcWithSms = await loadConversationIdsWithSms(supabase, ids);
  if (rpcWithSms) {
    return conversationRows.filter((r) => rpcWithSms.has(r.id)).slice(0, maxVisible);
  }

  const { data, error } = await supabase
    .from("messages")
    .select("conversation_id")
    .in("conversation_id", ids)
    .eq("message_type", SMS_MESSAGE_TYPE)
    .is("deleted_at", null);

  if (error) {
    console.warn("[sms-inbox-conversation-scope] has-sms check:", error.message);
    return conversationRows.slice(0, maxVisible);
  }

  const withSms = new Set<string>();
  for (const row of data ?? []) {
    const cid = typeof row.conversation_id === "string" ? row.conversation_id : "";
    if (cid) withSms.add(cid);
  }

  return conversationRows.filter((r) => withSms.has(r.id)).slice(0, maxVisible);
}
