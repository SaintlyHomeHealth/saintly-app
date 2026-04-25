import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { findContactByIncomingPhone } from "@/lib/crm/find-contact-by-incoming-phone";
import { logSmsMessageForLeadTimeline } from "@/lib/crm/lead-communication-activity";
import { notifyInboundSmsAfterPersist } from "@/lib/push/notify-inbound-sms";
import { ensureSmsConversationForPhone } from "@/lib/phone/sms-conversation-thread";
import { scheduleSmsReplySuggestionGeneration } from "@/lib/phone/sms-reply-suggestion";
import { isValidE164, normalizeDialInputToE164 } from "@/lib/softphone/phone-number";
import { allowlistedOutboundE164OrUndefined } from "@/lib/twilio/manual-inbox-sms-from";

export type InboundTwilioSmsParams = Record<string, string>;

/**
 * Inbound `To` must be one of our Twilio long codes (or any number on the Messaging Service when
 * `TWILIO_SMS_FROM` is `MG…`). Builds the E.164 allowlist for the non-MG case:
 * - normalized `TWILIO_SMS_FROM` when it is E.164
 * - optional `TWILIO_INBOUND_ALLOWED_TO_NUMBERS` (comma-separated E.164)
 * - Saintly shared Messaging Service numbers (+14803600008, +14805712062) so inbound works when
 *   `TWILIO_SMS_FROM` points at only one of them.
 *
 * Outbound SMS is unchanged: `sendSms` still uses `TWILIO_SMS_FROM` / `fromOverride` only.
 */
function buildInboundAllowedToE164Set(): Set<string> {
  const set = new Set<string>();
  const fromEnv = process.env.TWILIO_SMS_FROM?.trim();
  if (fromEnv && !fromEnv.startsWith("MG")) {
    const n = normalizeDialInputToE164(fromEnv);
    if (n && isValidE164(n)) set.add(n);
  }
  const csv = process.env.TWILIO_INBOUND_ALLOWED_TO_NUMBERS?.trim();
  if (csv) {
    for (const part of csv.split(",")) {
      const p = part.trim();
      if (!p) continue;
      const n = normalizeDialInputToE164(p);
      if (n && isValidE164(n)) set.add(n);
    }
  }
  for (const def of ["+14803600008", "+14805712062"] as const) {
    const n = normalizeDialInputToE164(def);
    if (n && isValidE164(n)) set.add(n);
  }
  return set;
}

function smsTiming(phase: string, detail?: Record<string, unknown>): void {
  if (process.env.SMS_PUSH_TIMING !== "1") return;
  console.log("[SMS]", phase, Date.now(), detail ?? {});
}

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

  smsTiming("handler_start", {
    messageSid: messageSid || "(missing)",
    fromRaw,
    toRaw,
    bodyLen: body.length,
  });

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

  let inboundToAllowed = false;
  if (usesMessagingServiceSid) {
    /** Twilio routes inbound to any long code on the service; do not tie to a single env number. */
    inboundToAllowed = true;
    console.log("[sms-inbound] inbound_to_validation", {
      fromE164,
      toE164,
      mode: "messaging_service_sid",
      inboundToAllowed: true,
      twilioSmsFromKind: "MG",
    });
  } else {
    const allowedTo = buildInboundAllowedToE164Set();
    inboundToAllowed = allowedTo.has(toE164);
    console.log("[sms-inbound] inbound_to_validation", {
      fromE164,
      toE164,
      mode: "e164_allowlist",
      inboundToAllowed,
      allowlistSize: allowedTo.size,
      twilioSmsFromKind: "e164",
    });
    if (!inboundToAllowed) {
      console.warn("[sms-inbound] To not in inbound allowlist (TWILIO_SMS_FROM + optional TWILIO_INBOUND_ALLOWED_TO_NUMBERS + defaults)", {
        toE164,
        allowedSample: [...allowedTo].sort(),
      });
      return { ok: false, error: "To not in allowed inbound numbers" };
    }
  }

  console.log("[sms-inbound] normalized", { fromE164, toE164, inboundToAllowed });

  smsTiming("before_contact_lookup");
  const contact = await findContactByIncomingPhone(supabase, fromE164);
  smsTiming("after_contact_lookup", { matchedContact: Boolean(contact?.id) });

  smsTiming("before_ensure_conversation");
  const ensured = await ensureSmsConversationForPhone(supabase, fromE164, contact);
  if (!ensured.ok) {
    console.warn("[sms-inbound] ensure conversation failed", ensured.error);
    return { ok: false, error: ensured.error };
  }
  const conversationId = ensured.conversationId;
  smsTiming("after_ensure_conversation", { conversationId });
  console.log("[sms-inbound] conversation", { conversationId, matchedContact: Boolean(contact?.id) });

  const metadata = {
    twilio_account_sid: params.AccountSid ?? null,
    twilio_api_version: params.ApiVersion ?? null,
    num_media: params.NumMedia ?? null,
    /** Business line that received this SMS (workspace “Text from” lock / UI seed). */
    inbound_to_e164: toE164,
  };

  smsTiming("before_message_insert");
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
      smsTiming("duplicate_message_sid_skip", { messageSid });
      console.log("[sms-inbound] duplicate MessageSid (idempotent ok)", { messageSid });
      console.log("[sms-inbound] persist_pipeline_result", {
        ok: true,
        duplicateMessageSid: true,
        messageSid,
        inboundToAllowed,
      });
      return { ok: true };
    }
    console.warn("[sms-inbound] message insert failed", msgErr.message);
    return { ok: false, error: msgErr.message };
  }

  console.log("[sms-inbound] inbound message inserted", { conversationId, messageId: insertedMsg?.id });
  smsTiming("after_message_insert", { conversationId, messageId: insertedMsg?.id });

  if (insertedMsg?.id) {
    const contactIdForLog =
      ensured.primaryContactId ?? (contact?.id ? String(contact.id) : null);
    void logSmsMessageForLeadTimeline({
      direction: "inbound",
      contactId: contactIdForLog,
      partyPhoneE164: fromE164,
      conversationId,
      messageId: String(insertedMsg.id),
      body,
    });
  }

  if (process.env.SMS_UNREAD_DEBUG === "1" && insertedMsg) {
    console.warn("[sms-unread-debug] inbound insert row", {
      id: insertedMsg.id,
      conversation_id: (insertedMsg as { conversation_id?: string }).conversation_id,
      direction: (insertedMsg as { direction?: string }).direction,
      viewed_at: (insertedMsg as { viewed_at?: string | null }).viewed_at,
    });
  }

  // Await push so serverless requests do not freeze the isolate before FCM completes (Vercel).
  smsTiming("before_sms_push_await", { conversationId });
  console.log("[sms-inbound] about_to_await_sms_push", { conversationId, messageId: insertedMsg?.id });
  try {
    await notifyInboundSmsAfterPersist(supabase, {
      conversationId,
      bodyPreview: body,
      fromE164: fromE164,
      matchedContact: contact,
      primaryContactId: ensured.primaryContactId,
      externalMessageSid: messageSid,
    });
    console.log("[sms-inbound] sms_push_await_finished", { conversationId, messageId: insertedMsg?.id });
  } catch (e) {
    console.warn("[sms-inbound] sms_push_await_failed", {
      conversationId,
      messageId: insertedMsg?.id,
      error: e instanceof Error ? e.message : String(e),
    });
  }
  smsTiming("after_sms_push_await", { conversationId });

  if (process.env.SMS_AI_SUGGESTIONS_DISABLED !== "1" && insertedMsg?.id) {
    scheduleSmsReplySuggestionGeneration(supabase, conversationId, String(insertedMsg.id), fromE164);
  }

  smsTiming("before_conversation_touch");
  const now = new Date().toISOString();

  const lockFrom = allowlistedOutboundE164OrUndefined(toE164);
  const { data: convPrefRow, error: convPrefErr } = await supabase
    .from("conversations")
    .select("preferred_from_e164")
    .eq("id", conversationId)
    .maybeSingle();

  if (convPrefErr) {
    console.warn("[sms-inbound] preferred_from_e164 read:", convPrefErr.message);
  }

  const prefExisting =
    convPrefRow?.preferred_from_e164 != null && String(convPrefRow.preferred_from_e164).trim() !== ""
      ? String(convPrefRow.preferred_from_e164).trim()
      : null;

  const setPreferredFromInbound = !prefExisting && Boolean(lockFrom);

  const { error: touchErr } = await supabase
    .from("conversations")
    .update({
      last_message_at: now,
      updated_at: now,
      ...(setPreferredFromInbound && lockFrom ? { preferred_from_e164: lockFrom } : {}),
    })
    .eq("id", conversationId);

  if (touchErr) {
    console.warn("[sms-inbound] last_message_at touch:", touchErr.message);
  }
  smsTiming("after_conversation_touch");

  smsTiming("handler_done");
  console.log("[sms-inbound] persist_pipeline_result", {
    ok: true,
    conversationId,
    messageId: insertedMsg?.id ?? null,
    inboundToAllowed,
    messageSid,
  });
  return { ok: true };
}
