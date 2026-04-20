import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { canStaffAccessConversationRow } from "@/lib/phone/staff-conversation-access";
import type { StaffProfile } from "@/lib/staff-profile";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function refreshConversationLastMessageAt(
  supabase: SupabaseClient,
  conversationId: string
): Promise<void> {
  const now = new Date().toISOString();
  const { data: row } = await supabase
    .from("messages")
    .select("created_at")
    .eq("conversation_id", conversationId)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const last = row && typeof row.created_at === "string" ? row.created_at : null;
  const { error } = await supabase
    .from("conversations")
    .update({ last_message_at: last, updated_at: now })
    .eq("id", conversationId);

  if (error) {
    console.warn("[sms-soft-delete] refresh last_message_at:", error.message);
  }
}

async function loadConversationAccessRow(
  supabase: SupabaseClient,
  conversationId: string
): Promise<{
  id: string;
  assigned_to_user_id: string | null;
  deleted_at: string | null;
} | null> {
  const { data, error } = await supabase
    .from("conversations")
    .select("id, assigned_to_user_id, deleted_at")
    .eq("id", conversationId)
    .eq("channel", "sms")
    .maybeSingle();

  if (error || !data?.id) {
    return null;
  }

  const assigned =
    data.assigned_to_user_id != null && String(data.assigned_to_user_id).trim() !== ""
      ? String(data.assigned_to_user_id)
      : null;

  const del =
    data.deleted_at != null && String(data.deleted_at).trim() !== ""
      ? String(data.deleted_at)
      : null;

  return { id: String(data.id), assigned_to_user_id: assigned, deleted_at: del };
}

/**
 * Soft-delete one message; updates conversation ordering (last_message_at).
 */
export async function softDeleteSmsMessage(
  supabase: SupabaseClient,
  staff: StaffProfile,
  input: { conversationId: string; messageId: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const conversationId = input.conversationId.trim();
  const messageId = input.messageId.trim();
  if (!UUID_RE.test(conversationId) || !UUID_RE.test(messageId)) {
    return { ok: false, error: "invalid_id" };
  }

  const conv = await loadConversationAccessRow(supabase, conversationId);
  if (!conv || conv.deleted_at) {
    return { ok: false, error: "conversation_not_found" };
  }

  if (!canStaffAccessConversationRow(staff, { assigned_to_user_id: conv.assigned_to_user_id })) {
    return { ok: false, error: "forbidden" };
  }

  const { data: msg, error: msgLoadErr } = await supabase
    .from("messages")
    .select("id, conversation_id, deleted_at")
    .eq("id", messageId)
    .maybeSingle();

  if (msgLoadErr || !msg?.id || String(msg.conversation_id) !== conversationId) {
    return { ok: false, error: "message_not_found" };
  }

  if (msg.deleted_at != null && String(msg.deleted_at).trim() !== "") {
    await refreshConversationLastMessageAt(supabase, conversationId);
    return { ok: true };
  }

  const now = new Date().toISOString();
  const { error: upErr } = await supabase
    .from("messages")
    .update({ deleted_at: now, deleted_by_user_id: staff.user_id })
    .eq("id", messageId)
    .eq("conversation_id", conversationId);

  if (upErr) {
    console.warn("[sms-soft-delete] message update:", upErr.message);
    return { ok: false, error: "update_failed" };
  }

  await refreshConversationLastMessageAt(supabase, conversationId);
  return { ok: true };
}

/**
 * Soft-delete entire thread: conversation row + all messages.
 */
export async function softDeleteSmsConversation(
  supabase: SupabaseClient,
  staff: StaffProfile,
  input: { conversationId: string }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const conversationId = input.conversationId.trim();
  if (!UUID_RE.test(conversationId)) {
    return { ok: false, error: "invalid_id" };
  }

  const conv = await loadConversationAccessRow(supabase, conversationId);
  if (!conv || conv.deleted_at) {
    return { ok: false, error: "conversation_not_found" };
  }

  if (!canStaffAccessConversationRow(staff, { assigned_to_user_id: conv.assigned_to_user_id })) {
    return { ok: false, error: "forbidden" };
  }

  const now = new Date().toISOString();

  const { error: msgErr } = await supabase
    .from("messages")
    .update({ deleted_at: now, deleted_by_user_id: staff.user_id })
    .eq("conversation_id", conversationId)
    .is("deleted_at", null);

  if (msgErr) {
    console.warn("[sms-soft-delete] bulk messages:", msgErr.message);
    return { ok: false, error: "update_failed" };
  }

  const { error: convErr } = await supabase
    .from("conversations")
    .update({
      deleted_at: now,
      deleted_by_user_id: staff.user_id,
      last_message_at: null,
      updated_at: now,
    })
    .eq("id", conversationId);

  if (convErr) {
    console.warn("[sms-soft-delete] conversation update:", convErr.message);
    return { ok: false, error: "update_failed" };
  }

  return { ok: true };
}
