/**
 * Automated intro SMS for new Facebook Lead Ads rows (Zapier/Make webhook + Meta Graph path).
 * CSV import skips this path intentionally.
 */
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { appendOutboundSmsToConversation, ensureSmsConversationForOutboundSystem } from "@/lib/phone/sms-conversation-thread";
import { normalizeDialInputToE164, isValidE164 } from "@/lib/softphone/phone-number";
import { sendSms } from "@/lib/twilio/send-sms";

function firstValue(map: Map<string, string>, keys: string[]): string {
  for (const k of keys) {
    const v = map.get(k);
    if (v) return v;
  }
  return "";
}

/** Temporary outbound DID until port completes; override with `FACEBOOK_LEAD_INTRO_SMS_FROM`. */
export const FACEBOOK_LEAD_INTRO_SMS_FROM_DEFAULT = "+14805712062";

function resolveIntroFromE164(): string {
  const env = process.env.FACEBOOK_LEAD_INTRO_SMS_FROM?.trim();
  return env || FACEBOOK_LEAD_INTRO_SMS_FROM_DEFAULT;
}

/** Editable copy — personalized line uses `buildFacebookLeadIntroBody`. */
export const FACEBOOK_LEAD_INTRO_TEMPLATE_NAMED =
  "Hi {first_name}, we just received your request from Saintly Home Health. Our team will reach out to you shortly. You can also reply here now if you have any questions.";

export const FACEBOOK_LEAD_INTRO_TEMPLATE_GENERIC =
  "Hi, we just received your request from Saintly Home Health. Our team will reach out to you shortly. You can also reply here now if you have any questions.";

export function buildFacebookLeadIntroBody(firstName: string | null | undefined): string {
  const n = typeof firstName === "string" ? firstName.trim() : "";
  if (n) {
    return FACEBOOK_LEAD_INTRO_TEMPLATE_NAMED.replace("{first_name}", n);
  }
  return FACEBOOK_LEAD_INTRO_TEMPLATE_GENERIC;
}

function resolveIntroSmsFirstName(
  fieldMap: Map<string, string>,
  nameParts: { first_name: string; last_name: string }
): string | null {
  const direct = firstValue(fieldMap, ["first_name", "first name", "firstname"]).trim();
  if (direct) {
    const word = direct.split(/\s+/).filter(Boolean)[0];
    return word ? word.slice(0, 80) : null;
  }

  const full = firstValue(fieldMap, ["full_name", "full name", "your_full_name", "name"]).trim();
  if (full) {
    const word = full.split(/\s+/).filter(Boolean)[0];
    return word ? word.slice(0, 80) : null;
  }

  const first = nameParts.first_name.trim();
  const last = nameParts.last_name.trim();
  if (/^facebook$/i.test(first) && /^lead$/i.test(last)) {
    return null;
  }
  return first ? first.slice(0, 80) : null;
}

function storedPhoneToE164(primaryPhoneStored: string | null): string | null {
  if (!primaryPhoneStored || !String(primaryPhoneStored).trim()) return null;
  const raw = String(primaryPhoneStored).trim();
  const withPlus =
    raw.startsWith("+") ? raw : raw.length === 10 && /^\d+$/.test(raw) ? `+1${raw}` : raw.length === 11 && raw.startsWith("1") ? `+${raw}` : raw;
  const e164 = normalizeDialInputToE164(withPlus);
  return e164 && isValidE164(e164) ? e164 : null;
}

export async function runFacebookLeadIntroSmsAfterInsert(
  supabase: SupabaseClient,
  params: {
    leadId: string;
    fieldMap: Map<string, string>;
    nameParts: { first_name: string; last_name: string };
    primaryPhoneStored: string | null;
    ingestionChannel?: "automation" | "csv";
  }
): Promise<void> {
  const { leadId, fieldMap, nameParts, primaryPhoneStored, ingestionChannel } = params;

  if (ingestionChannel === "csv") {
    return;
  }

  console.log("[facebook-lead-intro-sms] lead created", { lead_id: leadId });

  try {
    const e164 = storedPhoneToE164(primaryPhoneStored);
    if (!e164) {
      const { error: skipErr } = await supabase
        .from("leads")
        .update({
          initial_sms_status: "skipped",
          initial_sms_error: "invalid_or_missing_phone",
        })
        .eq("id", leadId)
        .is("initial_sms_status", null);

      if (skipErr) {
        console.warn("[facebook-lead-intro-sms] skipped update failed", { lead_id: leadId, error: skipErr.message });
      } else {
        console.log("[facebook-lead-intro-sms] skipped", { lead_id: leadId, reason: "invalid_or_missing_phone" });
      }
      return;
    }

    const { data: claimed, error: claimErr } = await supabase
      .from("leads")
      .update({ initial_sms_status: "pending" })
      .eq("id", leadId)
      .is("initial_sms_status", null)
      .select("id")
      .maybeSingle();

    if (claimErr) {
      console.warn("[facebook-lead-intro-sms] claim pending failed", { lead_id: leadId, error: claimErr.message });
      return;
    }
    if (!claimed?.id) {
      return;
    }

    console.log("[facebook-lead-intro-sms] attempted", { lead_id: leadId, to: e164 });

    const firstName = resolveIntroSmsFirstName(fieldMap, nameParts);
    const body = buildFacebookLeadIntroBody(firstName);
    const fromOverride = resolveIntroFromE164();

    const conv = await ensureSmsConversationForOutboundSystem(supabase, e164);
    if (!conv.ok) {
      const errText = `conversation_ensure_failed:${conv.error}`;
      await supabase
        .from("leads")
        .update({ initial_sms_status: "failed", initial_sms_error: errText.slice(0, 2000) })
        .eq("id", leadId);
      console.warn("[facebook-lead-intro-sms] failed", { lead_id: leadId, error: errText });
      return;
    }

    const sms = await sendSms({ to: e164, body, fromOverride });
    const sentAt = new Date().toISOString();

    if (!sms.ok) {
      await supabase
        .from("leads")
        .update({
          initial_sms_status: "failed",
          initial_sms_error: sms.error.slice(0, 2000),
        })
        .eq("id", leadId);
      console.warn("[facebook-lead-intro-sms] failed", { lead_id: leadId, error: sms.error.slice(0, 500) });
      return;
    }

    /** Matches `metadata.twilio_delivery` shape from `applyTwilioOutboundMessageStatus` (status webhooks merge later). */
    const twilioDelivery = {
      status: sms.twilioStatus ?? "queued",
      error_code: null as string | null,
      error_message: null as string | null,
      updated_at: sentAt,
      from: fromOverride,
      to: e164,
    };

    const appended = await appendOutboundSmsToConversation(supabase, {
      conversationId: conv.conversationId,
      body,
      messageSid: sms.messageSid,
      metadata: {
        source: "facebook_lead_intro",
        lead_id: leadId,
        twilio_message_sid: sms.messageSid,
        ...(sms.twilioAccountSid ? { twilio_account_sid: sms.twilioAccountSid } : {}),
        twilio_delivery: twilioDelivery,
      },
    });

    if (!appended.ok) {
      console.error("[facebook-lead-intro-sms] partial_failure SMS sent but inbox row not persisted", {
        lead_id: leadId,
        conversation_id: conv.conversationId,
        message_sid: sms.messageSid,
        twilio_status: sms.twilioStatus ?? null,
        append_error: appended.error,
      });
    }

    await supabase
      .from("leads")
      .update({
        initial_sms_status: "sent",
        initial_sms_sent_at: sentAt,
        initial_sms_error: null,
      })
      .eq("id", leadId);

    console.log("[facebook-lead-intro-sms] sent", { lead_id: leadId, message_sid: sms.messageSid });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[facebook-lead-intro-sms] unhandled", { lead_id: leadId, error: msg.slice(0, 500) });
    try {
      await supabase
        .from("leads")
        .update({
          initial_sms_status: "failed",
          initial_sms_error: `unhandled:${msg.slice(0, 1800)}`,
        })
        .eq("id", leadId)
        .in("initial_sms_status", ["pending"]);
    } catch {
      /* ignore */
    }
  }
}
