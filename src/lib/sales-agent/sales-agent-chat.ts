import { randomUUID } from "crypto";

import { supabaseAdmin } from "@/lib/admin";

import {
  isAllowedSalesAgentChatAttachmentMime,
  isSalesAgentChatImageMime,
  maxBytesForSalesAgentChatAttachmentMime,
  SALES_AGENT_CHAT_ATTACHMENTS_BUCKET,
  salesAgentChatAttachmentFileRoute,
} from "./sales-agent-chat-attachment-constants";
import { salesAgentChatDebugLog } from "./sales-agent-chat-debug";
import type {
  SalesAgentChatAgentOption,
  SalesAgentMessageAttachmentView,
  SalesAgentMessageRow,
  SalesAgentMessageView,
  SalesAgentWorkspaceChatListItem,
} from "./sales-agent-chat-types";
import { salesAgentDisplayName } from "./sales-agent-chat-types";

export type {
  SalesAgentChatAgentOption,
  SalesAgentMessageAttachmentView,
  SalesAgentMessageRow,
  SalesAgentMessageView,
  SalesAgentWorkspaceChatListItem,
} from "./sales-agent-chat-types";
export { salesAgentDisplayName } from "./sales-agent-chat-types";

type AttachmentRow = {
  id: string;
  message_id: string;
  file_name: string | null;
  mime_type: string | null;
  file_size_bytes: number | null;
};

function safeFilename(name: string): string {
  const base = name.replace(/[^\w.\-()+ ]/g, "_").trim() || "file";
  return base.slice(0, 120);
}

function attachmentPreviewLabel(mime: string | null | undefined, fileName: string | null | undefined): string {
  const t = (mime ?? "").toLowerCase();
  if (t.startsWith("image/")) return "Photo";
  if (t === "application/pdf" || (fileName ?? "").toLowerCase().endsWith(".pdf")) return "PDF";
  return "File";
}

function mapAttachmentRows(rows: AttachmentRow[]): Map<string, SalesAgentMessageAttachmentView[]> {
  const byMessage = new Map<string, SalesAgentMessageAttachmentView[]>();
  for (const row of rows) {
    const mime = typeof row.mime_type === "string" ? row.mime_type : null;
    const view: SalesAgentMessageAttachmentView = {
      id: row.id,
      message_id: row.message_id,
      file_name: typeof row.file_name === "string" ? row.file_name : null,
      mime_type: mime,
      file_size_bytes: typeof row.file_size_bytes === "number" ? row.file_size_bytes : null,
      fileUrl: salesAgentChatAttachmentFileRoute(row.id),
      isImage: isSalesAgentChatImageMime(mime),
    };
    const list = byMessage.get(row.message_id) ?? [];
    list.push(view);
    byMessage.set(row.message_id, list);
  }
  return byMessage;
}

export async function listAttachmentsForMessages(messageIds: string[]): Promise<Map<string, SalesAgentMessageAttachmentView[]>> {
  if (messageIds.length === 0) return new Map();

  const { data, error } = await supabaseAdmin
    .from("sales_agent_message_attachments")
    .select("id, message_id, file_name, mime_type, file_size_bytes")
    .in("message_id", messageIds)
    .order("created_at", { ascending: true });

  if (error) {
    console.warn("[sales-agent/chat] list attachments:", error.message);
    return new Map();
  }

  return mapAttachmentRows((data ?? []) as AttachmentRow[]);
}

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
}): Promise<{ ok: boolean; messageId?: string; error?: string }> {
  const body = input.body.trim();

  const { data, error } = await supabaseAdmin
    .from("sales_agent_messages")
    .insert({
      sales_agent_user_id: input.salesAgentUserId,
      sender_user_id: input.senderUserId,
      sender_role: input.senderRole,
      body,
    })
    .select("id")
    .single();

  if (error) {
    console.warn("[sales-agent/chat] insert:", error.message);
    salesAgentChatDebugLog("insert failed", {
      salesAgentUserId: input.salesAgentUserId,
      senderRole: input.senderRole,
      error: error.message,
    });
    return { ok: false, error: error.message };
  }

  const messageId = typeof data?.id === "string" ? data.id : undefined;
  salesAgentChatDebugLog("insert ok", {
    messageId,
    salesAgentUserId: input.salesAgentUserId,
    senderUserId: input.senderUserId,
    senderRole: input.senderRole,
    bodyLen: body.length,
  });
  return { ok: true, messageId };
}

export async function deleteSalesAgentMessage(messageId: string): Promise<void> {
  await supabaseAdmin.from("sales_agent_messages").delete().eq("id", messageId);
}

function inferMimeFromFilename(name: string): string | null {
  const lower = name.toLowerCase();
  if (lower.endsWith(".pdf")) return "application/pdf";
  if (lower.endsWith(".doc")) return "application/msword";
  if (lower.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".heic")) return "image/heic";
  if (lower.endsWith(".webp")) return "image/webp";
  return null;
}

export async function insertSalesAgentMessageAttachment(input: {
  messageId: string;
  salesAgentUserId: string;
  uploadedBy: string;
  file: File;
}): Promise<{ ok: boolean; attachmentId?: string; error?: string }> {
  let mime = (input.file.type || "").trim().toLowerCase();
  if (!mime || mime === "application/octet-stream") {
    mime = inferMimeFromFilename(input.file.name) ?? mime;
  }
  if (!mime) mime = "application/octet-stream";
  if (!isAllowedSalesAgentChatAttachmentMime(mime)) {
    return { ok: false, error: "unsupported_type" };
  }

  const maxB = maxBytesForSalesAgentChatAttachmentMime(mime);
  if (input.file.size > maxB) {
    return { ok: false, error: "too_large" };
  }

  const attachmentId = randomUUID();
  const safe = safeFilename(input.file.name);
  const storagePath = `${input.salesAgentUserId}/${input.messageId}/${attachmentId}-${safe}`;
  const buf = Buffer.from(await input.file.arrayBuffer());

  const { error: upErr } = await supabaseAdmin.storage
    .from(SALES_AGENT_CHAT_ATTACHMENTS_BUCKET)
    .upload(storagePath, buf, { contentType: mime, upsert: false });

  if (upErr) {
    console.warn("[sales-agent/chat] attachment upload:", upErr.message);
    return { ok: false, error: upErr.message };
  }

  const { error: insErr } = await supabaseAdmin.from("sales_agent_message_attachments").insert({
    id: attachmentId,
    message_id: input.messageId,
    sales_agent_user_id: input.salesAgentUserId,
    uploaded_by: input.uploadedBy,
    storage_bucket: SALES_AGENT_CHAT_ATTACHMENTS_BUCKET,
    storage_path: storagePath,
    file_name: input.file.name || safe,
    mime_type: mime,
    file_size_bytes: input.file.size,
  });

  if (insErr) {
    await supabaseAdmin.storage.from(SALES_AGENT_CHAT_ATTACHMENTS_BUCKET).remove([storagePath]).catch(() => {});
    console.warn("[sales-agent/chat] attachment insert:", insErr.message);
    return { ok: false, error: insErr.message };
  }

  return { ok: true, attachmentId };
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
  const attachmentMap = await listAttachmentsForMessages(messages.map((m) => m.id));
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
    out.push({
      ...m,
      senderLabel,
      attachments: attachmentMap.get(m.id) ?? [],
    });
  }
  return out;
}

/** Managers/admins: Sales Agent threads that have at least one message. */
export async function listSalesAgentThreadsForWorkspaceChat(
  viewerUserId: string
): Promise<SalesAgentWorkspaceChatListItem[]> {
  const { data: rows, error } = await supabaseAdmin
    .from("sales_agent_messages")
    .select("id, sales_agent_user_id, body, created_at, sender_user_id, sender_role, read_at")
    .order("created_at", { ascending: false });

  if (error) {
    console.warn("[sales-agent/chat] workspace threads:", error.message);
    salesAgentChatDebugLog("workspace threads query failed", {
      viewerUserId,
      error: error.message,
    });
    return [];
  }

  salesAgentChatDebugLog("workspace threads query", {
    viewerUserId,
    rowCount: rows?.length ?? 0,
  });

  const messageIds = (rows ?? []).map((r) => r.id).filter((id): id is string => typeof id === "string");
  const attachmentMap = await listAttachmentsForMessages(messageIds);

  const byAgent = new Map<
    string,
    { lastMessagePreview: string; lastMessageAt: string; hasUnread: boolean }
  >();

  for (const row of rows ?? []) {
    const agentId = typeof row.sales_agent_user_id === "string" ? row.sales_agent_user_id : "";
    if (!agentId || byAgent.has(agentId)) continue;

    const attachments = attachmentMap.get(row.id) ?? [];
    const bodyText = typeof row.body === "string" ? row.body.trim() : "";
    let preview = bodyText.slice(0, 120);
    if (!preview && attachments.length > 0) {
      preview = attachmentPreviewLabel(attachments[0]?.mime_type, attachments[0]?.file_name);
    }

    byAgent.set(agentId, {
      lastMessagePreview: preview,
      lastMessageAt: typeof row.created_at === "string" ? row.created_at : "",
      hasUnread: row.sender_role === "sales_agent" && row.read_at == null,
    });
  }

  const unreadAgents = new Set<string>();
  for (const row of rows ?? []) {
    const agentId = typeof row.sales_agent_user_id === "string" ? row.sales_agent_user_id : "";
    if (!agentId) continue;
    if (row.sender_role === "sales_agent" && row.read_at == null) {
      unreadAgents.add(agentId);
    }
  }

  const agentIds = [...byAgent.keys()];
  if (agentIds.length === 0) {
    salesAgentChatDebugLog("workspace threads empty", { viewerUserId });
    return [];
  }

  const { data: profiles } = await supabaseAdmin
    .from("staff_profiles")
    .select("user_id, full_name, email")
    .in("user_id", agentIds);

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

  salesAgentChatDebugLog("workspace threads result", {
    viewerUserId,
    threadCount: items.length,
    agents: items.map((i) => ({ agentUserId: i.agentUserId, title: i.title, hasUnread: i.hasUnread })),
  });

  return items;
}

export async function getSalesAgentChatAttachmentForDownload(attachmentId: string): Promise<{
  storage_bucket: string;
  storage_path: string;
  file_name: string | null;
  mime_type: string | null;
  sales_agent_user_id: string;
} | null> {
  const { data, error } = await supabaseAdmin
    .from("sales_agent_message_attachments")
    .select("storage_bucket, storage_path, file_name, mime_type, sales_agent_user_id")
    .eq("id", attachmentId)
    .maybeSingle();

  if (error || !data?.storage_path || !data.storage_bucket) {
    return null;
  }

  return {
    storage_bucket: String(data.storage_bucket),
    storage_path: String(data.storage_path),
    file_name: typeof data.file_name === "string" ? data.file_name : null,
    mime_type: typeof data.mime_type === "string" ? data.mime_type : null,
    sales_agent_user_id: String(data.sales_agent_user_id),
  };
}
