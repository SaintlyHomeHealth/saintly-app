import "server-only";

import { supabaseAdmin } from "@/lib/admin";
import { salesAgentDisplayName } from "@/lib/sales-agent/sales-agent-chat-types";
import {
  SALES_AGENT_CHAT,
  salesAgentWorkspaceChatThreadPath,
} from "@/lib/sales-agent/sales-agent-workspace-paths";
import { isManagerOrHigher, isSalesAgentRole, type StaffProfile, type StaffRole } from "@/lib/staff-profile";

import { sendFcmDataAndNotificationToUserIds } from "./send-fcm-to-user-ids";

const LOG = "[push] sales-agent-chat";

export function salesAgentChatPushDebugEnabled(): boolean {
  return process.env.SALES_AGENT_CHAT_PUSH_DEBUG === "1";
}

function debugLog(msg: string, detail?: Record<string, unknown>): void {
  if (!salesAgentChatPushDebugEnabled()) return;
  console.info(`${LOG} ${msg}`, detail ?? "");
}

function staffStub(role: StaffRole): StaffProfile {
  return {
    id: "",
    user_id: "",
    email: null,
    role,
    created_at: "",
    updated_at: "",
    full_name: null,
    is_active: true,
    phone_access_enabled: false,
    inbound_ring_enabled: false,
    applicant_id: null,
    sms_notify_phone: null,
    admin_shell_access: true,
    page_access_preset: null,
    page_permissions: {},
    require_password_change: false,
    phone_assignment_mode: "organization_default",
    dedicated_outbound_e164: null,
    shared_line_e164: null,
    phone_calling_profile: "inbound_outbound",
    sms_messaging_enabled: false,
    voicemail_access_enabled: false,
    shared_line_permissions: {},
    softphone_mobile_enabled: true,
    softphone_web_enabled: true,
    push_notifications_enabled: true,
    call_recording_enabled: false,
  };
}

async function filterPushEnabledUserIds(userIds: string[]): Promise<string[]> {
  const unique = [...new Set(userIds.map((u) => u.trim()).filter(Boolean))];
  if (unique.length === 0) return [];

  const { data, error } = await supabaseAdmin
    .from("staff_profiles")
    .select("user_id, push_notifications_enabled")
    .in("user_id", unique)
    .eq("is_active", true);

  if (error) {
    console.warn(LOG, "load push prefs failed", error.message);
    return [];
  }

  return (data ?? [])
    .filter((p) => p.push_notifications_enabled !== false)
    .map((p) => String(p.user_id))
    .filter(Boolean);
}

/** Active manager-tier staff (excludes sales agents and sender). */
async function resolveManagerPushRecipientUserIds(excludeUserId: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from("staff_profiles")
    .select("user_id, role")
    .eq("is_active", true)
    .not("user_id", "is", null);

  if (error) {
    console.warn(LOG, "resolve managers failed", error.message);
    return [];
  }

  const ids: string[] = [];
  for (const row of data ?? []) {
    const uid = typeof row.user_id === "string" ? row.user_id.trim() : "";
    if (!uid || uid === excludeUserId) continue;
    const role = typeof row.role === "string" ? (row.role as StaffRole) : null;
    if (!role || isSalesAgentRole(staffStub(role))) continue;
    if (!isManagerOrHigher(staffStub(role))) continue;
    ids.push(uid);
  }

  return filterPushEnabledUserIds(ids);
}

async function agentDisplayName(agentUserId: string): Promise<string> {
  const { data } = await supabaseAdmin
    .from("staff_profiles")
    .select("user_id, full_name, email")
    .eq("user_id", agentUserId)
    .maybeSingle();

  return salesAgentDisplayName({
    user_id: agentUserId,
    full_name: typeof data?.full_name === "string" ? data.full_name : null,
    email: typeof data?.email === "string" ? data.email : null,
    unread_count: 0,
  });
}

/**
 * App push only (FCM) — no SMS/email. Best-effort; never throws.
 */
export async function notifySalesAgentChatMessagePush(input: {
  messageId: string;
  salesAgentUserId: string;
  senderUserId: string;
  senderRole: string;
  hasAttachment: boolean;
  hasTextBody: boolean;
}): Promise<void> {
  if (process.env.SAINTLY_PUSH_SALES_AGENT_CHAT_DISABLED === "1") {
    debugLog("skipped", { reason: "SAINTLY_PUSH_SALES_AGENT_CHAT_DISABLED" });
    return;
  }

  const salesAgentUserId = input.salesAgentUserId.trim();
  const senderUserId = input.senderUserId.trim();
  const messageId = input.messageId.trim();
  if (!salesAgentUserId || !senderUserId || !messageId) {
    return;
  }

  try {
    const isFromAgent = input.senderRole === "sales_agent";

    if (isFromAgent) {
      const recipients = await resolveManagerPushRecipientUserIds(senderUserId);
      const agentName = await agentDisplayName(salesAgentUserId);
      const body =
        input.hasAttachment && !input.hasTextBody
          ? `${agentName} sent an attachment`
          : `${agentName} sent you a message`;
      const openPath = salesAgentWorkspaceChatThreadPath(salesAgentUserId);

      debugLog("agent_to_managers", {
        senderUserId,
        salesAgentUserId,
        recipientCount: recipients.length,
        openPath,
        hasAttachment: input.hasAttachment,
        messageId,
      });

      const result = await sendFcmDataAndNotificationToUserIds(supabaseAdmin, recipients, {
        title: "New Sales Agent Message",
        body,
        data: {
          type: "sales_agent_chat",
          sales_agent_user_id: salesAgentUserId,
          message_id: messageId,
          open_path: openPath,
        },
        apnsCollapseId: `sa-chat-${messageId}`,
      });

      debugLog("send_complete", {
        direction: "agent_to_managers",
        senderUserId,
        recipientCount: recipients.length,
        ok: result.ok,
        sent: result.ok ? result.sent : 0,
        failureCount: result.ok ? result.failureCount : undefined,
        tokenFailures: result.ok ? result.errors.length : undefined,
      });

      if (!result.ok) {
        console.warn(LOG, "notify failed", { direction: "agent_to_managers", error: result.error, messageId });
      }
      return;
    }

    if (!isManagerOrHigher(staffStub(input.senderRole as StaffRole))) {
      return;
    }

    const recipients = await filterPushEnabledUserIds([salesAgentUserId]).then((ids) =>
      ids.filter((id) => id !== senderUserId)
    );
    if (recipients.length === 0) {
      debugLog("admin_to_agent_skipped", { reason: "no_recipients", salesAgentUserId, senderUserId });
      return;
    }
    const openPath = SALES_AGENT_CHAT;

    debugLog("admin_to_agent", {
      senderUserId,
      salesAgentUserId,
      recipientCount: recipients.length,
      openPath,
      messageId,
    });

    const result = await sendFcmDataAndNotificationToUserIds(supabaseAdmin, recipients, {
      title: "New Message from Saintly",
      body: "Saintly Admin replied to your message",
      data: {
        type: "sales_agent_chat",
        sales_agent_user_id: salesAgentUserId,
        message_id: messageId,
        open_path: openPath,
      },
      apnsCollapseId: `sa-chat-reply-${messageId}`,
    });

    debugLog("send_complete", {
      direction: "admin_to_agent",
      senderUserId,
      recipientCount: recipients.length,
      ok: result.ok,
      sent: result.ok ? result.sent : 0,
      failureCount: result.ok ? result.failureCount : undefined,
    });

    if (!result.ok) {
      console.warn(LOG, "notify failed", { direction: "admin_to_agent", error: result.error, messageId });
    }
  } catch (e) {
    console.warn(LOG, "notify exception", e);
  }
}
