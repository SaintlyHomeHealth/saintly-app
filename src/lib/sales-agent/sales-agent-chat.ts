import { supabaseAdmin } from "@/lib/admin";

import type { SalesAgentChatAgentOption, SalesAgentMessageRow } from "./sales-agent-chat-types";

export type { SalesAgentChatAgentOption, SalesAgentMessageRow } from "./sales-agent-chat-types";
export { salesAgentDisplayName } from "./sales-agent-chat-types";

export async function listSalesAgentMessages(agentUserId: string): Promise<SalesAgentMessageRow[]> {
  const { data, error } = await supabaseAdmin
    .from("sales_agent_messages")
    .select("id, sales_agent_user_id, sender_user_id, sender_role, body, read_at, created_at")
    .eq("sales_agent_user_id", agentUserId)
    .order("created_at", { ascending: true })
    .limit(500);

  if (error) {
    console.warn("[sales-agent/chat] list messages:", error.message);
    return [];
  }
  return (data ?? []) as SalesAgentMessageRow[];
}

export async function salesAgentHasUnreadMessages(agentUserId: string, viewerUserId: string): Promise<boolean> {
  const { count, error } = await supabaseAdmin
    .from("sales_agent_messages")
    .select("id", { count: "exact", head: true })
    .eq("sales_agent_user_id", agentUserId)
    .is("read_at", null)
    .neq("sender_user_id", viewerUserId);

  if (error) {
    console.warn("[sales-agent/chat] unread check:", error.message);
    return false;
  }
  return (count ?? 0) > 0;
}

export async function markSalesAgentMessagesRead(agentUserId: string, readerUserId: string): Promise<void> {
  const now = new Date().toISOString();
  const { error } = await supabaseAdmin
    .from("sales_agent_messages")
    .update({ read_at: now })
    .eq("sales_agent_user_id", agentUserId)
    .is("read_at", null)
    .neq("sender_user_id", readerUserId);

  if (error) {
    console.warn("[sales-agent/chat] mark read:", error.message);
  }
}

export async function insertSalesAgentMessage(input: {
  salesAgentUserId: string;
  senderUserId: string;
  senderRole: string;
  body: string;
}): Promise<{ ok: boolean; error?: string }> {
  const body = input.body.trim();
  if (!body) return { ok: false, error: "empty" };

  const { error } = await supabaseAdmin.from("sales_agent_messages").insert({
    sales_agent_user_id: input.salesAgentUserId,
    sender_user_id: input.senderUserId,
    sender_role: input.senderRole,
    body,
  });

  if (error) {
    console.warn("[sales-agent/chat] insert:", error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function listActiveSalesAgentsForChat(): Promise<SalesAgentChatAgentOption[]> {
  const { data: agents, error } = await supabaseAdmin
    .from("staff_profiles")
    .select("user_id, full_name, email")
    .eq("role", "sales_agent")
    .eq("is_active", true)
    .not("user_id", "is", null)
    .order("full_name", { ascending: true });

  if (error) {
    console.warn("[sales-agent/chat] list agents:", error.message);
    return [];
  }

  const rows = (agents ?? []).filter((a) => typeof a.user_id === "string" && a.user_id.trim());
  const out: SalesAgentChatAgentOption[] = [];

  for (const row of rows) {
    const userId = row.user_id as string;
    const { count } = await supabaseAdmin
      .from("sales_agent_messages")
      .select("id", { count: "exact", head: true })
      .eq("sales_agent_user_id", userId)
      .eq("sender_role", "sales_agent")
      .is("read_at", null);

    out.push({
      user_id: userId,
      full_name: typeof row.full_name === "string" ? row.full_name : null,
      email: typeof row.email === "string" ? row.email : null,
      unread_count: count ?? 0,
    });
  }

  return out;
}
