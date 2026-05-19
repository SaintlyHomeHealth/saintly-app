"use server";

import { revalidatePath } from "next/cache";

import { getStaffProfile, isManagerOrHigher, isSalesAgentRole } from "@/lib/staff-profile";
import { notifySalesAgentChatMessagePush } from "@/lib/push/notify-sales-agent-chat";
import {
  deleteSalesAgentMessage,
  insertSalesAgentMessage,
  insertSalesAgentMessageAttachment,
  markSalesAgentMessagesRead,
} from "@/lib/sales-agent/sales-agent-chat";
import { requireSalesAgent } from "@/lib/sales-agent/sales-agent-auth";
import { SALES_AGENT_CHAT } from "@/lib/sales-agent/sales-agent-workspace-paths";

function revalidateSalesAgentChatPaths(agentUserId?: string) {
  revalidatePath(SALES_AGENT_CHAT);
  revalidatePath("/workspace/phone/chat");
  if (agentUserId) {
    revalidatePath(`/workspace/phone/chat/sales-agent/${agentUserId}`);
  }
}

function fileFromFormData(formData: FormData): File | null {
  const raw = formData.get("attachment");
  if (raw instanceof File && raw.size > 0) {
    return raw;
  }
  return null;
}

async function sendWithOptionalAttachment(input: {
  salesAgentUserId: string;
  senderUserId: string;
  senderRole: string;
  body: string;
  attachment: File | null;
}): Promise<
  | { ok: true; messageId: string; hasAttachment: boolean; hasTextBody: boolean }
  | { ok: false; error: string }
> {
  const body = input.body.trim();
  const hasTextBody = Boolean(body);
  const hasAttachment = Boolean(input.attachment);
  if (!hasTextBody && !hasAttachment) {
    return { ok: false, error: "Message or attachment is required." };
  }

  const inserted = await insertSalesAgentMessage({
    salesAgentUserId: input.salesAgentUserId,
    senderUserId: input.senderUserId,
    senderRole: input.senderRole,
    body,
  });

  if (!inserted.ok || !inserted.messageId) {
    return { ok: false, error: "Could not send message." };
  }

  if (!input.attachment) {
    return { ok: true, messageId: inserted.messageId, hasAttachment: false, hasTextBody };
  }

  const attached = await insertSalesAgentMessageAttachment({
    messageId: inserted.messageId,
    salesAgentUserId: input.salesAgentUserId,
    uploadedBy: input.senderUserId,
    file: input.attachment,
  });

  if (!attached.ok) {
    await deleteSalesAgentMessage(inserted.messageId);
    if (attached.error === "unsupported_type") {
      return { ok: false, error: "That file type is not supported." };
    }
    if (attached.error === "too_large") {
      return { ok: false, error: "File is too large." };
    }
    return { ok: false, error: "Message sent but attachment upload failed. Please try again." };
  }

  return { ok: true, messageId: inserted.messageId, hasAttachment: true, hasTextBody };
}

export async function sendSalesAgentChatMessage(formData: FormData) {
  const staff = await requireSalesAgent();
  const body = String(formData.get("body") ?? "").trim();
  const attachment = fileFromFormData(formData);

  const result = await sendWithOptionalAttachment({
    salesAgentUserId: staff.user_id,
    senderUserId: staff.user_id,
    senderRole: "sales_agent",
    body,
    attachment,
  });

  if (!result.ok) return { ok: false as const, error: result.error };

  void notifySalesAgentChatMessagePush({
    messageId: result.messageId,
    salesAgentUserId: staff.user_id,
    senderUserId: staff.user_id,
    senderRole: "sales_agent",
    hasAttachment: result.hasAttachment,
    hasTextBody: result.hasTextBody,
  });

  revalidateSalesAgentChatPaths(staff.user_id);
  return { ok: true as const };
}

export async function markSalesAgentChatReadAction() {
  const staff = await requireSalesAgent();
  await markSalesAgentMessagesRead(staff.user_id, staff.user_id);
  revalidateSalesAgentChatPaths(staff.user_id);
  return { ok: true as const };
}

export async function sendAdminToSalesAgentChatMessage(formData: FormData) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return { ok: false as const, error: "Forbidden" };
  }

  const agentUserId = String(formData.get("agentUserId") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  const attachment = fileFromFormData(formData);
  if (!agentUserId) {
    return { ok: false as const, error: "Agent is required." };
  }

  const result = await sendWithOptionalAttachment({
    salesAgentUserId: agentUserId,
    senderUserId: staff.user_id,
    senderRole: staff.role,
    body,
    attachment,
  });

  if (!result.ok) return { ok: false as const, error: result.error };

  void notifySalesAgentChatMessagePush({
    messageId: result.messageId,
    salesAgentUserId: agentUserId,
    senderUserId: staff.user_id,
    senderRole: staff.role,
    hasAttachment: result.hasAttachment,
    hasTextBody: result.hasTextBody,
  });

  revalidatePath("/admin/sales-agent-chat");
  revalidateSalesAgentChatPaths(agentUserId);
  return { ok: true as const };
}

export async function markAdminSalesAgentChatReadAction(agentUserId: string) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return { ok: false as const, error: "Forbidden" };
  }
  const id = agentUserId.trim();
  if (!id) return { ok: false as const, error: "Invalid agent" };

  await markSalesAgentMessagesRead(id, staff.user_id);
  revalidatePath("/admin/sales-agent-chat");
  revalidateSalesAgentChatPaths(id);
  return { ok: true as const };
}

export async function assertSalesAgentChatAccess() {
  const staff = await getStaffProfile();
  if (!staff || !isSalesAgentRole(staff)) {
    throw new Error("forbidden");
  }
  return staff;
}
