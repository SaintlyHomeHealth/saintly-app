import { supabaseAdmin } from "@/lib/admin";

import type {
  SalesAgentChatAgentOption,
  SalesAgentMessageRow,
  SalesAgentMessageView,
  SalesAgentWorkspaceChatListItem,
} from "./sales-agent-chat-types";
import { salesAgentDisplayName } from "./sales-agent-chat-types";

export type { SalesAgentChatAgentOption, SalesAgentMessageRow, SalesAgentMessageView, SalesAgentWorkspaceChatListItem } from "./sales-agent-chat-types";
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

async function staffLabelForUserId(userId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from("staff_profiles")
    .select("full_name, email, role")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data) return "Staff";
  const name = salesAgentDisplayName({
    user_id: userId,
    full_name: typeof data.full_name === "string" ? data.full_name : null,
    email: typeof data.email === "string" ? data.email : null,
    unread_count: 0,
  });
  if (data.role === "sales_agent") return name;
  return name || "Saintly Admin";
}

export async function enrichSalesAgentMessagesForViewer(
  messages: SalesAgentMessageRow[],
  viewerUserId: string,
  agentTitle: string
): Promise<SalesAgentMessageView[]> {
  const labelCache = new Map<string, string>();
  const out: SalesAgentMessageView[] = [];

  for (const m of messages) {
    let senderLabel: string;
    if (m.sender_user_id === viewerUserId) {
      senderLabel = "You";
    } else if (m.sender_role === "sales_agent") {
      senderLabel = agentTitle;
    } else {
      const cached = labelCache.get(m.sender_user_id);
      if (cached) {
        senderLabel = cached;
      } else {
        senderLabel = await staffLabelForUserId(m.sender_user_id);
        labelCache.set(m.sender_user_id, senderLabel);
      }
    }
    out.push({ ...m, senderLabel });
  }
  return out;
}

/** Managers/admins: Sales Agent threads that have at least one message. */
export async function listSalesAgentThreadsForWorkspaceChat(
  viewerUserId: string
): Promise<SalesAgentWorkspaceChatListItem[]> {
  const { data: rows, error } = await supabaseAdmin
    .from("sales_agent_messages")
    .select("sales_agent_user_id, body, created_at, sender_user_id, read_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("[sales-agent/chat] workspace threads:", error.message);
    return [];
  }

  const byAgent = new Map<
    string,
    { lastMessagePreview: string; lastMessageAt: string; hasUnread: boolean }
  >();

  for (const row of rows ?? []) {
    const agentId = typeof row.sales_agent_user_id === "string" ? row.sales_agent_user_id : "";
    if (!agentId || byAgent.has(agentId)) continue;

    const fromAgentUnread = row.sender_role === "sales_agent" && row.read_at == null;
    byAgent.set(agentId, {
      lastMessagePreview: typeof row.body === "string" ? row.body.trim().slice(0, 120) : "",
      lastMessageAt: typeof row.created_at === "string" ? row.created_at : null,
      hasUnread: fromAgentUnread,
    });
  }

  // Scan all rows for unread from agents (not just latest message)
  const unreadAgents = new Set<string>();
  for (const row of rows ?? []) {
    const agentId = typeof row.sales_agent_user_id === "string" ? row.sales_agent_user_id : "";
    if (!agentId) continue;
    if (row.sender_role === "sales_agent" && row.read_at == null) {
      unreadAgents.add(agentId);
    }
  }

  const agentIds = [...byAgent.keys()];
  if (agentIds.length === 0) return [];

  const { data: profiles } = await supabaseAdmin
    .from("staff_profiles")
    .select("user_id, full_name, email")
    .in("user_id", agentIds)
    .eq("role", "sales_agent");

  const profileMap = new Map(
    (profiles ?? []).map((p) => [
      p.user_id as string,
      {
        full_name: typeof p.full_name === "string" ? p.full_name : null,
        email: typeof p.email === "string" ? p.email : null,
      },
    ])
  );

  const items: SalesAgentWorkspaceChatListItem[] = agentIds.map((agentUserId) => {
    const meta = byAgent.get(agentUserId)!;
    const prof = profileMap.get(agentUserId);
    return {
      agentUserId,
      title: salesAgentDisplayName({
        user_id: agentUserId,
        full_name: prof?.full_name ?? null,
        email: prof?.email ?? null,
        unread_count: 0,
      }),
      lastMessagePreview: meta.lastMessagePreview,
      lastMessageAt: meta.lastMessageAt,
      hasUnread: unreadAgents.has(agentUserId),
    };
  });

  items.sort((a, b) => (b.lastMessageAt ?? "").localeCompare(a.lastMessageAt ?? ""));
  return items;
}
