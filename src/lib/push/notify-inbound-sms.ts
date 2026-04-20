import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { CrmContactMatch } from "@/lib/crm/find-contact-by-incoming-phone";
import { buildIncomingContactDisplayName, type IncomingCallerContactRow } from "@/lib/crm/incoming-caller-lookup";
import { fcmSmsPushDeployFingerprint } from "@/lib/push/fcm-sms-push-diagnostics";
import { sendFcmDataAndNotificationToUserIds } from "@/lib/push/send-fcm-to-user-ids";
import { resolveSmsPushRecipientUserIds } from "@/lib/push/resolve-sms-push-recipients";
import { formatPhoneNumber } from "@/lib/phone/us-phone-format";

function truncate(s: string, max: number): string {
  const t = s.trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

function pushTiming(phase: string, detail?: Record<string, unknown>): void {
  if (process.env.SMS_PUSH_TIMING !== "1") return;
  console.log("[PUSH]", phase, Date.now(), detail ?? {});
}

function crmContactMatchToIncomingRow(c: CrmContactMatch): IncomingCallerContactRow {
  return {
    full_name: c.full_name,
    first_name: c.first_name,
    last_name: c.last_name,
    organization_name: c.organization_name,
    primary_phone: c.primary_phone,
    secondary_phone: c.secondary_phone,
  };
}

/**
 * Prefer CRM display name from the inbound phone match, then from the conversation's linked contact
 * (covers threads linked before this lookup), then formatted caller ID.
 */
async function resolveSmsPushSenderLabel(
  supabase: SupabaseClient,
  input: {
    matchedContact: CrmContactMatch | null;
    primaryContactId: string | null;
    fromE164: string | null | undefined;
  }
): Promise<string> {
  const raw = (input.fromE164 ?? "").trim();
  const phoneFallback = raw ? formatPhoneNumber(raw) || raw : "unknown";

  if (input.matchedContact) {
    const nm = buildIncomingContactDisplayName(crmContactMatchToIncomingRow(input.matchedContact));
    if (nm) return nm;
  }

  const pid = input.primaryContactId?.trim();
  if (pid) {
    const { data, error } = await supabase
      .from("contacts")
      .select("full_name, first_name, last_name, organization_name, primary_phone, secondary_phone")
      .eq("id", pid)
      .maybeSingle();
    if (!error && data) {
      const nm = buildIncomingContactDisplayName(data as IncomingCallerContactRow);
      if (nm) return nm;
    }
  }

  return phoneFallback;
}

/**
 * SMS push after a Twilio inbound SMS is persisted (idempotent duplicate MessageSid path skips notify).
 * The inbound webhook awaits this so serverless runtimes complete FCM before the request ends.
 */
export async function notifyInboundSmsAfterPersist(
  supabase: SupabaseClient,
  input: {
    conversationId: string;
    bodyPreview: string;
    fromE164?: string | null;
    /** CRM row from the same phone lookup used for the thread (no extra query). */
    matchedContact?: CrmContactMatch | null;
    /** From `ensureSmsConversationForPhone` — used when the thread is linked but phone match returned null. */
    primaryContactId?: string | null;
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
      deploy: fcmSmsPushDeployFingerprint(),
    });
    pushTiming("before_resolve_recipients");
    const userIds = await resolveSmsPushRecipientUserIds(supabase, input.conversationId);
    pushTiming("after_resolve_recipients", { recipientUserCount: userIds.length });
    if (userIds.length === 0) {
      console.log("[push] inbound SMS notify skipped", { reason: "no_recipient_user_ids", conversationId: input.conversationId.trim() });
      return;
    }
    pushTiming("before_resolve_sender_label");
    const senderLabel = await resolveSmsPushSenderLabel(supabase, {
      matchedContact: input.matchedContact ?? null,
      primaryContactId: input.primaryContactId ?? null,
      fromE164: input.fromE164,
    });
    pushTiming("after_resolve_sender_label");

    const from = (input.fromE164 ?? "").trim() || "unknown";
    const preview = truncate(input.bodyPreview || "(no text)", 120);
    const cid = input.conversationId.trim();
    const openPath = `/workspace/phone/inbox?${new URLSearchParams({ thread: cid }).toString()}`;
    const msgSid = (input.externalMessageSid ?? "").trim();
    const apnsCollapseId = msgSid ? `sms-${msgSid}` : undefined;

    pushTiming("before_send_fcm_helper");
    const result = await sendFcmDataAndNotificationToUserIds(supabase, userIds, {
      title: "New SMS",
      body: `${senderLabel}: ${preview}`,
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
      console.warn("[push] inbound SMS notify failed", {
        error: result.error,
        conversationId: input.conversationId.trim(),
        deploy: fcmSmsPushDeployFingerprint(),
      });
    } else {
      console.log("[push] inbound SMS notify complete", {
        success: true,
        conversationId: input.conversationId.trim(),
        deploy: fcmSmsPushDeployFingerprint(),
        recipientUserCount: userIds.length,
        sent: result.sent,
        failureCount: result.failureCount,
        invalidTokenRemovalCount: result.invalidTokenRemovalCount,
        errors: result.errors,
      });
    }
  } catch (e) {
    console.warn("[push] inbound SMS notify:", e);
    throw e;
  }
}
