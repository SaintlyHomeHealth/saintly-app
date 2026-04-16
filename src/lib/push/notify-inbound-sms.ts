import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { sendFcmDataAndNotificationToUserIds } from "@/lib/push/send-fcm-to-user-ids";
import { resolveSmsPushRecipientUserIds } from "@/lib/push/resolve-sms-push-recipients";

function truncate(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/**
 * Fire-and-forget SMS push after a Twilio inbound SMS is persisted (idempotent path skips).
 */
export async function notifyInboundSmsAfterPersist(
  supabase: SupabaseClient,
  input: {
    conversationId: string;
    bodyPreview: string;
    fromE164?: string | null;
  }
): Promise<void> {
  if (process.env.SAINTLY_PUSH_SMS_DISABLED === "1") {
    return;
  }
  try {
    const userIds = await resolveSmsPushRecipientUserIds(supabase, input.conversationId);
    if (userIds.length === 0) {
      return;
    }
    const from = (input.fromE164 ?? "").trim() || "unknown";
    const preview = truncate(input.bodyPreview || "(no text)", 120);
    const openPath = `/workspace/phone/inbox/${input.conversationId.trim()}`;

    const result = await sendFcmDataAndNotificationToUserIds(supabase, userIds, {
      title: "New SMS",
      body: `${from}: ${preview}`,
      data: {
        type: "sms_inbound",
        conversation_id: input.conversationId.trim(),
        open_path: openPath,
        from_e164: from,
      },
    });

    if (!result.ok) {
      console.warn("[push] inbound SMS notify:", result.error);
    } else {
      console.log("[push] inbound SMS notify sent", { sent: result.sent, recipients: userIds.length });
    }
  } catch (e) {
    console.warn("[push] inbound SMS notify:", e);
  }
}
