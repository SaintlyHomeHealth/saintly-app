import type { SupabaseClient } from "@supabase/supabase-js";

import { isValidCallerIdForPriority } from "@/lib/phone/priority-sms-rules";
import {
  appendOutboundSmsToConversation,
  ensureSmsConversationForOutboundSystem,
  hasRecentMissedCallAutoReplyToPhone,
} from "@/lib/phone/sms-conversation-thread";
import {
  CALLBACK_FOLLOWUP_SMS_BODY,
  FOLLOWUP_SMS_COOLDOWN_MS,
} from "@/lib/phone/voice-ai-callback-sms";
import { buildInitialTwilioDeliveryFromRestResponse } from "@/lib/phone/sms-delivery-ui";
import { resolveDefaultTwilioSmsFromOrMsid } from "@/lib/twilio/sms-from-numbers";
import { sendSms } from "@/lib/twilio/send-sms";

/**
 * Editable copy for missed-call SMS. Stored on phone_calls.auto_reply_sms_body when sent.
 * Also logged in conversations/messages for the SMS inbox.
 */
export const MISSED_CALL_AUTO_REPLY_BODY = CALLBACK_FOLLOWUP_SMS_BODY;

/** Minimum time between auto-reply SMS to the same E.164 (prevents spam on rapid repeat missed calls). */
export const MISSED_CALL_AUTO_REPLY_COOLDOWN_MS = FOLLOWUP_SMS_COOLDOWN_MS;

function asMetadata(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

async function recordAutoReplyAttemptFailure(
  supabase: SupabaseClient,
  callId: string,
  message: string
) {
  const { data: row, error: readErr } = await supabase
    .from("phone_calls")
    .select("metadata")
    .eq("id", callId)
    .maybeSingle();

  if (readErr) {
    console.warn("[missed-call-auto-reply] record failure read:", readErr.message);
    return;
  }

  const prevMeta = asMetadata(row?.metadata);
  const { error: upErr } = await supabase
    .from("phone_calls")
    .update({
      metadata: {
        ...prevMeta,
        saintly_auto_reply_sms: {
          last_attempt_at: new Date().toISOString(),
          last_error: message.slice(0, 2000),
        },
      },
    })
    .eq("id", callId);

  if (upErr) {
    console.warn("[missed-call-auto-reply] record failure update:", upErr.message);
  }
}

/**
 * Texts the inbound caller after a true missed call (no pickup, not abandoned).
 * Skips when voicemail is already recorded — caller already engaged; staff follow up via voicemail workflow.
 * Skips duplicate sends per call using phone_calls.auto_reply_sms_sent_at.
 * Skips when a missed-call auto-reply was recently logged to the same number (cooldown).
 * Logs the outbound SMS in conversations/messages when possible.
 */
export async function maybeSendMissedCallAutoReplyToCaller(
  supabase: SupabaseClient,
  input: {
    callId: string;
    direction: string;
    finalStatus: string;
    fromE164: string | null | undefined;
    voicemailRecordingSid: string | null | undefined;
  }
): Promise<void> {
  if (input.finalStatus !== "missed") return;
  if ((input.direction ?? "").trim().toLowerCase() !== "inbound") return;
  if (!isValidCallerIdForPriority(input.fromE164)) return;

  if ((input.voicemailRecordingSid ?? "").trim() !== "") return;

  const to = (input.fromE164 ?? "").trim();
  if (!to) return;

  const { data: row, error: selErr } = await supabase
    .from("phone_calls")
    .select("auto_reply_sms_sent_at, voicemail_recording_sid")
    .eq("id", input.callId)
    .maybeSingle();

  if (selErr) {
    console.warn("[missed-call-auto-reply] select:", selErr.message);
    return;
  }
  if (row?.auto_reply_sms_sent_at) return;
  if ((row?.voicemail_recording_sid ?? "").trim() !== "") return;

  const recent = await hasRecentMissedCallAutoReplyToPhone(
    supabase,
    to,
    MISSED_CALL_AUTO_REPLY_COOLDOWN_MS
  );
  if (recent) {
    console.warn("[missed-call-auto-reply] cooldown skip", { to: to.slice(0, 6), callId: input.callId });
    return;
  }

  const result = await sendSms({ to, body: MISSED_CALL_AUTO_REPLY_BODY });
  if (!result.ok) {
    console.error("[missed-call-auto-reply] sendSms:", result.error);
    await recordAutoReplyAttemptFailure(supabase, input.callId, result.error);
    return;
  }

  const ensured = await ensureSmsConversationForOutboundSystem(supabase, to);
  if (!ensured.ok) {
    console.error("[missed-call-auto-reply] ensure conversation:", ensured.error);
  } else {
    const deliveryAt = new Date().toISOString();
    const resolvedFrom = resolveDefaultTwilioSmsFromOrMsid();
    const fromE164 = resolvedFrom.startsWith("MG") ? null : resolvedFrom;
    const logged = await appendOutboundSmsToConversation(supabase, {
      conversationId: ensured.conversationId,
      body: MISSED_CALL_AUTO_REPLY_BODY,
      messageSid: result.messageSid,
      metadata: {
        source: "missed_call_auto_reply",
        phone_call_id: input.callId,
        twilio_delivery: buildInitialTwilioDeliveryFromRestResponse({
          twilioStatus: result.twilioStatus ?? null,
          updatedAtIso: deliveryAt,
          fromE164,
          toE164: to,
        }),
      },
      phoneCallId: input.callId,
    });
    if (!logged.ok) {
      console.error("[missed-call-auto-reply] log message:", logged.error);
    }
  }

  const sentAt = new Date().toISOString();
  const { data: updated, error: upErr } = await supabase
    .from("phone_calls")
    .update({
      auto_reply_sms_sent_at: sentAt,
      auto_reply_sms_body: MISSED_CALL_AUTO_REPLY_BODY,
    })
    .eq("id", input.callId)
    .is("auto_reply_sms_sent_at", null)
    .select("id")
    .maybeSingle();

  if (upErr) {
    console.warn("[missed-call-auto-reply] persist sent:", upErr.message);
    return;
  }
  if (!updated?.id) {
    console.warn("[missed-call-auto-reply] SMS sent but row not updated (duplicate or race)");
  }
}
