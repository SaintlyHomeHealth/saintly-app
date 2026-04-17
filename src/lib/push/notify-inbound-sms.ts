import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { sendFcmDataAndNotificationToUserIds } from "@/lib/push/send-fcm-to-user-ids";
import { resolveSmsPushRecipientUserIds } from "@/lib/push/resolve-sms-push-recipients";

function truncate(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function pushTiming(phase: string, detail?: Record<string, unknown>): void {
  if (process.env.SMS_PUSH_TIMING !== "1") return;
  console.log("[PUSH]", phase, Date.now(), detail ?? {});
}

/**
 * Fire-and-forget SMS push after a Twilio inbound SMS is persisted (idempotent path skips).
 * Called from the webhook immediately after insert so push is not blocked by conversation touch or AI.
 */
export async function notifyInboundSmsAfterPersist(
  supabase: SupabaseClient,
  input: {
    conversationId: string;
    bodyPreview: string;
    fromE164?: string | null;
    /** Twilio MessageSid — used for APNs collapse id so each SMS is a distinct alert. */
    externalMessageSid?: string | null;
  }
): Promise<void> {
  if (process.env.SAINTLY_PUSH_SMS_DISABLED === "1") {
    console.log("[push] inbound SMS notify skipped", { reason: "SAINTLY_PUSH_SMS_DISABLED" });
    return;
  }
  try {
    pushTiming("notify_start", { conversationId: input.conversationId.trim() });
    console.log("[push] inbound SMS notify start", {
      conversationId: input.conversationId.trim(),
    });
    pushTiming("before_resolve_recipients");
    const userIds = await resolveSmsPushRecipientUserIds(supabase, input.conversationId);
    pushTiming("after_resolve_recipients", { recipientUserCount: userIds.length });
    if (userIds.length === 0) {
      console.log("[push] inbound SMS notify skipped", { reason: "no_recipient_user_ids", conversationId: input.conversationId.trim() });
      return;
    }
    const from = (input.fromE164 ?? "").trim() || "unknown";
    const preview = truncate(input.bodyPreview || "(no text)", 120);
    const openPath = `/workspace/phone/inbox/${input.conversationId.trim()}`;
    const msgSid = (input.externalMessageSid ?? "").trim();
    const apnsCollapseId = msgSid ? `sms-${msgSid}` : undefined;

    pushTiming("before_send_fcm_helper");
    const result = await sendFcmDataAndNotificationToUserIds(supabase, userIds, {
      title: "New SMS",
      body: `${from}: ${preview}`,
      data: {
        type: "sms_inbound",
        conversation_id: input.conversationId.trim(),
        open_path: openPath,
        from_e164: from,
      },
      apnsCollapseId,
    });
    pushTiming("after_send_fcm_helper", { ok: result.ok, sent: result.ok ? result.sent : undefined });

    if (!result.ok) {
      console.warn("[push] inbound SMS notify failed", { error: result.error, conversationId: input.conversationId.trim() });
    } else {
      console.log("[push] inbound SMS notify complete", {
        success: true,
        conversationId: input.conversationId.trim(),
        recipientUserCount: userIds.length,
        sent: result.sent,
        failureCount: result.failureCount,
        invalidTokenRemovalCount: result.invalidTokenRemovalCount,
        errors: result.errors,
      });
    }
  } catch (e) {
    console.warn("[push] inbound SMS notify:", e);
  }
}
