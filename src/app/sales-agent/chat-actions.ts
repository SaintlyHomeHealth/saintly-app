"use server";

import { revalidatePath } from "next/cache";

import { getStaffProfile, isManagerOrHigher, isSalesAgentRole } from "@/lib/staff-profile";
import {
  insertSalesAgentMessage,
  markSalesAgentMessagesRead,
} from "@/lib/sales-agent/sales-agent-chat";
import { requireSalesAgent } from "@/lib/sales-agent/sales-agent-auth";
import { SALES_AGENT_CHAT } from "@/lib/sales-agent/sales-agent-workspace-paths";

export async function sendSalesAgentChatMessage(formData: FormData) {
  const staff = await requireSalesAgent();
  const body = String(formData.get("body") ?? "").trim();
  if (!body) return { ok: false as const, error: "Message is required." };

  const result = await insertSalesAgentMessage({
    salesAgentUserId: staff.user_id,
    senderUserId: staff.user_id,
    senderRole: "sales_agent",
    body,
  });

  if (!result.ok) return { ok: false as const, error: "Could not send message." };

  revalidatePath(SALES_AGENT_CHAT);
  return { ok: true as const };
}

export async function markSalesAgentChatReadAction() {
  const staff = await requireSalesAgent();
  await markSalesAgentMessagesRead(staff.user_id, staff.user_id);
  revalidatePath(SALES_AGENT_CHAT);
  return { ok: true as const };
}

export async function sendAdminToSalesAgentChatMessage(formData: FormData) {
  const staff = await getStaffProfile();
  if (!staff || !isManagerOrHigher(staff)) {
    return { ok: false as const, error: "Forbidden" };
  }

  const agentUserId = String(formData.get("agentUserId") ?? "").trim();
  const body = String(formData.get("body") ?? "").trim();
  if (!agentUserId || !body) {
    return { ok: false as const, error: "Agent and message are required." };
  }

  const result = await insertSalesAgentMessage({
    salesAgentUserId: agentUserId,
    senderUserId: staff.user_id,
    senderRole: staff.role,
    body,
  });

  if (!result.ok) return { ok: false as const, error: "Could not send message." };

  revalidatePath("/admin/sales-agent-chat");
  revalidatePath(SALES_AGENT_CHAT);
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
  return { ok: true as const };
}

export async function assertSalesAgentChatAccess() {
  const staff = await getStaffProfile();
  if (!staff || !isSalesAgentRole(staff)) {
    throw new Error("forbidden");
  }
  return staff;
}
