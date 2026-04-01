import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { findContactByIncomingPhone } from "@/lib/crm/find-contact-by-incoming-phone";
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

  if (!messageSid) {
    return { ok: false, error: "missing MessageSid" };
  }

  const fromE164 = normalizeDialInputToE164(fromRaw);
  if (!fromE164 || !isValidE164(fromE164)) {
    return { ok: false, error: "invalid From" };
  }

  const ourNumber = process.env.TWILIO_SMS_FROM?.trim();
  const toE164 = normalizeDialInputToE164(toRaw);
  if (!ourNumber || !toE164 || !isValidE164(toE164)) {
    return { ok: false, error: "missing TWILIO_SMS_FROM or invalid To" };
  }

  const ourNorm = normalizeDialInputToE164(ourNumber) ?? ourNumber;
  if (ourNorm !== toE164) {
    return { ok: false, error: "To does not match TWILIO_SMS_FROM" };
  }

  const contact = await findContactByIncomingPhone(supabase, fromE164);

  const ensured = await ensureSmsConversationForPhone(supabase, fromE164, contact);
  if (!ensured.ok) {
    return { ok: false, error: ensured.error };
  }
  const conversationId = ensured.conversationId;

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
    .select("id")
    .maybeSingle();

  if (msgErr) {
    const code = msgErr.code != null ? String(msgErr.code) : "";
    if (code === "23505") {
      return { ok: true };
    }
    return { ok: false, error: msgErr.message };
  }

  if (insertedMsg?.id) {
    scheduleSmsReplySuggestionGeneration(supabase, conversationId, String(insertedMsg.id), fromE164);
  }

  const now = new Date().toISOString();
  const { error: touchErr } = await supabase
    .from("conversations")
    .update({ last_message_at: now, updated_at: now })
    .eq("id", conversationId);

  if (touchErr) {
    console.warn("[inbound-sms] last_message_at:", touchErr.message);
  }

  return { ok: true };
}
