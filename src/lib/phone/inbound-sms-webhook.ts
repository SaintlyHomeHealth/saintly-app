import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { findContactByIncomingPhone } from "@/lib/crm/find-contact-by-incoming-phone";
import { notifyInboundSmsAfterPersist } from "@/lib/push/notify-inbound-sms";
import { ensureSmsConversationForPhone } from "@/lib/phone/sms-conversation-thread";
import { scheduleSmsReplySuggestionGeneration } from "@/lib/phone/sms-reply-suggestion";
import { isValidE164, normalizeDialInputToE164 } from "@/lib/softphone/phone-number";

export type InboundTwilioSmsParams = Record<string, string>;

/**
 * Persist inbound SMS from Twilio Messaging webhook (verified before calling).
 * Idempotent on MessageSid via unique index on messages.external_message_sid.
 */
export async function applyInboundTwilioSms(
  supabase: SupabaseClient,
  params: InboundTwilioSmsParams
): Promise<{ ok: true } | { ok: false; error: string }> {
  const messageSid = (params.MessageSid ?? params.SmsSid ?? "").trim();
  const fromRaw = (params.From ?? "").trim();
  const toRaw = (params.To ?? "").trim();
  const body = typeof params.Body === "string" ? params.Body : "";

  console.log("[sms-inbound] webhook persist start", {
    messageSid: messageSid || "(missing)",
    fromRaw,
    toRaw,
    bodyLen: body.length,
    hasBody: body.length > 0,
  });

  if (!messageSid) {
    console.warn("[sms-inbound] missing MessageSid");
    return { ok: false, error: "missing MessageSid" };
  }

  const fromE164 = normalizeDialInputToE164(fromRaw);
  if (!fromE164 || !isValidE164(fromE164)) {
    console.warn("[sms-inbound] invalid From after normalize", { fromRaw });
    return { ok: false, error: "invalid From" };
  }

  const ourNumber = process.env.TWILIO_SMS_FROM?.trim();
  const toE164 = normalizeDialInputToE164(toRaw);
  const usesMessagingServiceSid = Boolean(ourNumber?.startsWith("MG"));

  if (!ourNumber) {
    console.warn("[sms-inbound] TWILIO_SMS_FROM not set");
    return { ok: false, error: "missing TWILIO_SMS_FROM or invalid To" };
  }
  if (!toE164 || !isValidE164(toE164)) {
    console.warn("[sms-inbound] invalid To after normalize", { toRaw });
    return { ok: false, error: "missing TWILIO_SMS_FROM or invalid To" };
  }

  if (!usesMessagingServiceSid) {
    const ourNorm = normalizeDialInputToE164(ourNumber) ?? ourNumber;
    if (ourNorm !== toE164) {
      console.warn("[sms-inbound] To does not match TWILIO_SMS_FROM (normalized)", {
        toE164,
        ourNorm,
      });
      return { ok: false, error: "To does not match TWILIO_SMS_FROM" };
    }
  } else {
    console.log("[sms-inbound] TWILIO_SMS_FROM is Messaging Service SID; skipping To==FROM check");
  }

  console.log("[sms-inbound] normalized", { fromE164, toE164 });

  const contact = await findContactByIncomingPhone(supabase, fromE164);

  const ensured = await ensureSmsConversationForPhone(supabase, fromE164, contact);
  if (!ensured.ok) {
    console.warn("[sms-inbound] ensure conversation failed", ensured.error);
    return { ok: false, error: ensured.error };
  }
  const conversationId = ensured.conversationId;
  console.log("[sms-inbound] conversation", { conversationId, matchedContact: Boolean(contact?.id) });

  const metadata = {
    twilio_account_sid: params.AccountSid ?? null,
    twilio_api_version: params.ApiVersion ?? null,
    num_media: params.NumMedia ?? null,
  };

  const { data: insertedMsg, error: msgErr } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      direction: "inbound",
      body: body.slice(0, 32000),
      external_message_sid: messageSid,
      metadata,
    })
    .select("id, conversation_id, direction, viewed_at")
    .maybeSingle();

  if (msgErr) {
    const code = msgErr.code != null ? String(msgErr.code) : "";
    if (code === "23505") {
      console.log("[sms-inbound] duplicate MessageSid (idempotent ok)", { messageSid });
      return { ok: true };
    }
    console.warn("[sms-inbound] message insert failed", msgErr.message);
    return { ok: false, error: msgErr.message };
  }

  console.log("[sms-inbound] inbound message inserted", { conversationId, messageId: insertedMsg?.id });

  if (process.env.SMS_UNREAD_DEBUG === "1" && insertedMsg) {
    console.warn("[sms-unread-debug] inbound insert row", {
      id: insertedMsg.id,
      conversation_id: (insertedMsg as { conversation_id?: string }).conversation_id,
      direction: (insertedMsg as { direction?: string }).direction,
      viewed_at: (insertedMsg as { viewed_at?: string | null }).viewed_at,
    });
  }

  if (process.env.SMS_AI_SUGGESTIONS_DISABLED !== "1" && insertedMsg?.id) {
    scheduleSmsReplySuggestionGeneration(supabase, conversationId, String(insertedMsg.id), fromE164);
  }

  const now = new Date().toISOString();
  const { error: touchErr } = await supabase
    .from("conversations")
    .update({ last_message_at: now, updated_at: now })
    .eq("id", conversationId);

  if (touchErr) {
    console.warn("[sms-inbound] last_message_at touch:", touchErr.message);
  }

  console.log("[sms-inbound] scheduling push notify", { conversationId, messageId: insertedMsg?.id });
  void notifyInboundSmsAfterPersist(supabase, {
    conversationId,
    bodyPreview: body,
    fromE164: fromE164,
  });

  return { ok: true };
}
