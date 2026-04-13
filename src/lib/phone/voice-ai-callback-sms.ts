import type { SupabaseClient } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";

import type { VoiceAiFollowupPayload } from "@/lib/phone/voice-ai-followup-task";
import { shouldSuppressMissedCallStyleSms } from "@/lib/phone/inbound-call-sms-guards";
import { isValidCallerIdForPriority } from "@/lib/phone/priority-sms-rules";
import {
  appendOutboundSmsToConversation,
  ensureSmsConversationForOutboundSystem,
  hasRecentMissedCallAutoReplyToPhone,
} from "@/lib/phone/sms-conversation-thread";
import { sendSms } from "@/lib/twilio/send-sms";

/** Shared with missed-call auto-reply (one professional tone). */
export const CALLBACK_FOLLOWUP_SMS_BODY =
  "Hi, this is Saintly Home Health. We missed your call — how can we help you today?";

/** Same window as missed-call auto-reply (per-number anti-spam). */
export const FOLLOWUP_SMS_COOLDOWN_MS = 15 * 60 * 1000;

function asMetadata(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function asRecord(v: unknown): Record<string, unknown> | null {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return null;
}

async function recordCallbackFollowupSmsFailure(
  supabase: SupabaseClient,
  callId: string,
  message: string
): Promise<void> {
  const { data: row, error: readErr } = await supabase
    .from("phone_calls")
    .select("metadata")
    .eq("id", callId)
    .maybeSingle();

  if (readErr) {
    console.warn("[voice-ai-callback-sms] record failure read:", readErr.message);
    return;
  }

  const prevMeta = asMetadata(row?.metadata);
  const prevVoice = asRecord(prevMeta.voice_ai) ?? {};
  const { error: upErr } = await supabase
    .from("phone_calls")
    .update({
      metadata: {
        ...prevMeta,
        voice_ai: {
          ...prevVoice,
          callback_followup_sms_last_error: message.slice(0, 2000),
          callback_followup_sms_last_attempt_at: new Date().toISOString(),
        },
      },
    })
    .eq("id", callId);

  if (upErr) {
    console.warn("[voice-ai-callback-sms] record failure update:", upErr.message);
  }
}

/**
 * Sends at most one automatic follow-up SMS per call (idempotent via phone_calls.auto_reply_sms_sent_at
 * and metadata.voice_ai.callback_followup_sms_*).
 *
 * Triggers when AI says callback is needed, or when the call is missed with no voicemail (covers cases where
 * the synchronous missed-call auto-reply did not send — e.g. cooldown — without double-sending if it already did).
 * Skips spam classifications and invalid caller IDs.
 */
export async function maybeSendVoiceAiCallbackFollowupSms(
  supabase: SupabaseClient,
  callId: string,
  voicePayload: VoiceAiFollowupPayload
): Promise<void> {
  const cat = (voicePayload.caller_category ?? "").trim().toLowerCase();
  if (cat === "spam") {
    return;
  }

  const { data: row, error: selErr } = await supabase
    .from("phone_calls")
    .select("id, direction, status, duration_seconds, from_e164, auto_reply_sms_sent_at, metadata")
    .eq("id", callId)
    .maybeSingle();

  if (selErr) {
    console.warn("[voice-ai-callback-sms] select:", selErr.message);
    return;
  }
  if (!row?.id) {
    return;
  }

  if (shouldSuppressMissedCallStyleSms(row)) {
    return;
  }

  if (row.auto_reply_sms_sent_at) {
    return;
  }

  const prevVoice = asRecord(asMetadata(row.metadata).voice_ai);
  if (typeof prevVoice?.callback_followup_sms_sent_at === "string" && prevVoice.callback_followup_sms_sent_at.trim()) {
    return;
  }

  const direction = typeof row.direction === "string" ? row.direction.trim().toLowerCase() : "";
  if (direction !== "inbound") {
    return;
  }

  const fromE164 = row.from_e164 as string | null | undefined;
  if (!isValidCallerIdForPriority(fromE164)) {
    return;
  }

  const sendForCallback = voicePayload.callback_needed === true;
  /** Missed-call SMS is sent by {@link triggerAutoFollowUp} after terminal status (unified copy + CRM). */
  const sendForMissedNoResponse = false;

  if (!sendForCallback && !sendForMissedNoResponse) {
    return;
  }

  const to = (fromE164 ?? "").trim();

  const recent = await hasRecentMissedCallAutoReplyToPhone(supabase, to, FOLLOWUP_SMS_COOLDOWN_MS);
  if (recent) {
    console.warn("[voice-ai-callback-sms] cooldown skip", { to: to.slice(0, 6), callId });
    return;
  }

  const result = await sendSms({ to, body: CALLBACK_FOLLOWUP_SMS_BODY });
  if (!result.ok) {
    console.error("[voice-ai-callback-sms] sendSms:", result.error);
    await recordCallbackFollowupSmsFailure(supabase, callId, result.error);
    return;
  }

  const ensured = await ensureSmsConversationForOutboundSystem(supabase, to);
  if (!ensured.ok) {
    console.error("[voice-ai-callback-sms] ensure conversation:", ensured.error);
  } else {
    const logged = await appendOutboundSmsToConversation(supabase, {
      conversationId: ensured.conversationId,
      body: CALLBACK_FOLLOWUP_SMS_BODY,
      messageSid: result.messageSid,
      metadata: {
        source: "voice_ai_callback_followup",
        phone_call_id: callId,
      },
      phoneCallId: callId,
    });
    if (!logged.ok) {
      console.error("[voice-ai-callback-sms] log message:", logged.error);
    }
  }

  const sentAt = new Date().toISOString();

  const { data: metaRow, error: metaReadErr } = await supabase
    .from("phone_calls")
    .select("metadata")
    .eq("id", callId)
    .maybeSingle();

  if (metaReadErr) {
    console.warn("[voice-ai-callback-sms] read metadata for merge:", metaReadErr.message);
  }

  const prevMeta = asMetadata(metaRow?.metadata);
  const voice = asRecord(prevMeta.voice_ai) ?? {};

  const patch: Record<string, unknown> = {
    auto_reply_sms_sent_at: sentAt,
    auto_reply_sms_body: CALLBACK_FOLLOWUP_SMS_BODY,
  };

  if (Object.keys(voice).length > 0) {
    const nextVoice: Record<string, unknown> = { ...voice };
    nextVoice.callback_followup_sms_sent_at = sentAt;
    nextVoice.callback_followup_sms_message_sid = result.messageSid;
    delete nextVoice.callback_followup_sms_last_error;
    delete nextVoice.callback_followup_sms_last_attempt_at;
    patch.metadata = {
      ...prevMeta,
      voice_ai: nextVoice,
    };
  }

  const { data: updated, error: upErr } = await supabase
    .from("phone_calls")
    .update(patch)
    .eq("id", callId)
    .is("auto_reply_sms_sent_at", null)
    .select("id")
    .maybeSingle();

  if (upErr) {
    console.warn("[voice-ai-callback-sms] persist sent:", upErr.message);
    return;
  }
  if (!updated?.id) {
    console.warn("[voice-ai-callback-sms] SMS sent but row not updated (duplicate or race)");
  }

  try {
    revalidatePath("/admin/phone");
    revalidatePath("/admin/phone/calls");
    revalidatePath("/admin/phone/tasks");
    revalidatePath(`/admin/phone/${callId}`);
  } catch {
    /* ignore outside Next request context */
  }
}
