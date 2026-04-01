import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { findContactByIncomingPhone } from "@/lib/crm/find-contact-by-incoming-phone";
import { ensureActiveLeadForContact } from "@/lib/phone/twilio-voice-intake-crm";
import { isValidE164, normalizeDialInputToE164 } from "@/lib/softphone/phone-number";

export type SmsReplyClassification = "opt_out" | "patient" | "referral" | "unknown";

export function classifySmsReply(text: string): SmsReplyClassification {
  const lower = text.toLowerCase();

  if (lower.includes("stop") || lower.includes("wrong number")) {
    return "opt_out";
  }

  if (
    lower.includes("yes") ||
    lower.includes("call") ||
    lower.includes("help") ||
    lower.includes("home health")
  ) {
    return "patient";
  }

  if (lower.includes("referral") || lower.includes("doctor") || lower.includes("agency")) {
    return "referral";
  }

  return "unknown";
}

function asMetadata(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const PATIENT_AUTO_REPLY = "Got it — we’ll call you shortly.";
const REFERRAL_AUTO_REPLY = "Thank you — our team will reach out right away.";

export type SmsIntakeReplyInput = {
  fromRaw: string;
  body: string;
  messageSid: string;
};

export type SmsIntakeReplyResult =
  | { ok: true; twimlInner: string | null; classification: SmsReplyClassification }
  | { ok: false; error: string };

/**
 * Inbound SMS reply → optional lead + CRM hint on latest phone_call + TwiML auto-reply body.
 * Idempotent per MessageSid when a phone_call row exists (metadata.sms_intake_converted_message_sid).
 */
export async function processSmsIntakeReply(
  supabase: SupabaseClient,
  input: SmsIntakeReplyInput
): Promise<SmsIntakeReplyResult> {
  const fromE164 = normalizeDialInputToE164(input.fromRaw.trim());
  if (!fromE164 || !isValidE164(fromE164)) {
    return { ok: false, error: "invalid From" };
  }

  const body = typeof input.body === "string" ? input.body : "";
  const messageSid = input.messageSid.trim();
  if (!messageSid) {
    return { ok: false, error: "missing MessageSid" };
  }

  console.log("[sms-intake] reply received", {
    from: fromE164.slice(0, 6) + "…",
    sid: messageSid.slice(0, 12) + "…",
  });

  const classification = classifySmsReply(body);
  console.log("[sms-intake] classified", { classification });

  if (classification === "opt_out" || classification === "unknown") {
    return { ok: true, twimlInner: null, classification };
  }

  const contact = await findContactByIncomingPhone(supabase, fromE164);
  if (!contact?.id) {
    return { ok: true, twimlInner: null, classification };
  }

  const contactId = contact.id;

  const { data: byFrom, error: errFrom } = await supabase
    .from("phone_calls")
    .select("id, metadata")
    .eq("direction", "inbound")
    .eq("from_e164", fromE164)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (errFrom) {
    console.warn("[sms-intake] phone_calls by from:", errFrom.message);
  }

  let callRow = byFrom?.id ? byFrom : null;

  if (!callRow?.id) {
    const { data: byContact, error: errContact } = await supabase
      .from("phone_calls")
      .select("id, metadata")
      .eq("contact_id", contactId)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (errContact) {
      console.warn("[sms-intake] phone_calls by contact:", errContact.message);
    }
    callRow = byContact?.id ? byContact : null;
  }

  const crmType = classification === "patient" ? "patient" : "referral";

  if (callRow?.id) {
    const meta = asMetadata(callRow.metadata);
    if (meta.sms_intake_converted_message_sid === messageSid) {
      return { ok: true, twimlInner: null, classification };
    }
  }

  await ensureActiveLeadForContact(contactId);
  console.log("[sms-intake] lead created", { contactId: contactId.slice(0, 8) + "…", classification });

  if (callRow?.id) {
    const meta = asMetadata(callRow.metadata);
    const prevCrm =
      meta.crm && typeof meta.crm === "object" && !Array.isArray(meta.crm)
        ? (meta.crm as Record<string, unknown>)
        : {};
    const prevType = typeof prevCrm.type === "string" ? prevCrm.type.trim() : "";
    const nextCrm: Record<string, unknown> = {
      ...prevCrm,
      ...(prevType === "" ? { type: crmType } : {}),
      outcome:
        typeof prevCrm.outcome === "string" && prevCrm.outcome.trim()
          ? prevCrm.outcome
          : "needs_followup",
    };

    const { error: upCallErr } = await supabase
      .from("phone_calls")
      .update({
        metadata: {
          ...meta,
          crm: nextCrm,
          sms_intake_converted_message_sid: messageSid,
          sms_intake_last_classification: classification,
          sms_intake_last_reply_at: new Date().toISOString(),
        },
      })
      .eq("id", callRow.id);

    if (upCallErr) {
      console.warn("[sms-intake] update phone_calls metadata:", upCallErr.message);
    }

    const { error: evErr } = await supabase.from("phone_call_events").insert({
      call_id: callRow.id,
      event_type: "sms.intake_reply",
      payload: {
        message_sid: messageSid,
        classification,
        crm_type_applied: prevType === "" ? crmType : null,
        body_excerpt: body.slice(0, 500),
      },
    });

    if (evErr) {
      console.warn("[sms-intake] phone_call_events:", evErr.message);
    }
  }

  const autoReply =
    classification === "patient" ? PATIENT_AUTO_REPLY : REFERRAL_AUTO_REPLY;
  return {
    ok: true,
    twimlInner: `<Message>${escapeXml(autoReply)}</Message>`,
    classification,
  };
}
