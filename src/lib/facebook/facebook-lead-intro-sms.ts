/**
 * Automated intro SMS for new Facebook Lead Ads rows (Zapier/Make webhook, Meta Graph, partner API).
 * CSV import skips this path intentionally.
 *
 * Sends only during 8:00–19:00 America/Phoenix; otherwise queues for the next 8:00 open (see cron).
 */
import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchCrmContactMatchById } from "@/lib/crm/find-contact-by-incoming-phone";
import {
  contactHasPriorOutboundSms,
  fieldMapFromLeadMetadataGraphFieldData,
  isWithinFacebookAutoTextBusinessHours,
  nextFacebookAutoTextOpenUtc,
} from "@/lib/facebook/facebook-auto-text-scheduling";
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

type AutoTextTerminal = "sent" | "skipped" | "failed";

function mirrorLegacyInitialSms(
  terminal: AutoTextTerminal,
  extras: { sentAt?: string | null; error?: string | null }
): {
  initial_sms_status: string;
  initial_sms_sent_at: string | null;
  initial_sms_error: string | null;
} {
  return {
    initial_sms_status: terminal,
    initial_sms_sent_at: terminal === "sent" ? (extras.sentAt ?? null) : null,
    initial_sms_error: extras.error ?? null,
  };
}

async function markAutoTextTerminal(
  supabase: SupabaseClient,
  leadId: string,
  terminal: AutoTextTerminal,
  extras: { sentAt?: string | null; error?: string | null } = {}
): Promise<void> {
  const legacy = mirrorLegacyInitialSms(terminal, extras);
  const { error } = await supabase
    .from("leads")
    .update({
      auto_text_status: terminal,
      auto_text_sent_at: terminal === "sent" ? (extras.sentAt ?? null) : null,
      auto_text_scheduled_at: null,
      ...legacy,
    })
    .eq("id", leadId);

  if (error) {
    console.warn("[facebook-lead-intro-sms] terminal update failed", { lead_id: leadId, error: error.message });
  }
}

async function markDeferredAutoText(
  supabase: SupabaseClient,
  leadId: string,
  scheduledAt: Date
): Promise<void> {
  const { error } = await supabase
    .from("leads")
    .update({
      auto_text_status: "pending",
      auto_text_scheduled_at: scheduledAt.toISOString(),
      auto_text_sent_at: null,
    })
    .eq("id", leadId)
    .is("auto_text_status", null);

  if (error) {
    console.warn("[facebook-lead-intro-sms] deferred schedule update failed", { lead_id: leadId, error: error.message });
  } else {
    console.log("[facebook-lead-intro-sms] deferred_until_open", {
      lead_id: leadId,
      auto_text_scheduled_at: scheduledAt.toISOString(),
    });
  }
}

async function claimLeadForAutoTextSend(
  supabase: SupabaseClient,
  leadId: string,
  mode: "immediate" | "deferred"
): Promise<boolean> {
  const nowIso = new Date().toISOString();
  const patch = {
    auto_text_status: "sending" as const,
    auto_text_scheduled_at: null as string | null,
    initial_sms_status: "pending" as const,
    initial_sms_error: null as string | null,
  };

  if (mode === "immediate") {
    const { data, error } = await supabase
      .from("leads")
      .update(patch)
      .eq("id", leadId)
      .is("auto_text_status", null)
      .select("id")
      .maybeSingle();
    if (error) {
      console.warn("[facebook-lead-intro-sms] immediate claim failed", { lead_id: leadId, error: error.message });
      return false;
    }
    return Boolean(data?.id);
  }

  const { data, error } = await supabase
    .from("leads")
    .update(patch)
    .eq("id", leadId)
    .eq("auto_text_status", "pending")
    .lte("auto_text_scheduled_at", nowIso)
    .select("id")
    .maybeSingle();

  if (error) {
    console.warn("[facebook-lead-intro-sms] deferred claim failed", { lead_id: leadId, error: error.message });
    return false;
  }
  return Boolean(data?.id);
}

async function sendIntroNow(
  supabase: SupabaseClient,
  params: {
    leadId: string;
    contactId: string;
    fieldMap: Map<string, string>;
    nameParts: { first_name: string; last_name: string };
    e164: string;
  }
): Promise<void> {
  const { leadId, contactId, fieldMap, nameParts, e164 } = params;

  console.log("[facebook-lead-intro-sms] attempted", { lead_id: leadId, to: e164 });

  const firstName = resolveIntroSmsFirstName(fieldMap, nameParts);
  const body = buildFacebookLeadIntroBody(firstName);
  const fromOverride = resolveIntroFromE164();

  const knownContact = await fetchCrmContactMatchById(supabase, contactId);
  const conv = await ensureSmsConversationForOutboundSystem(supabase, e164, {
    leadStatusOnCreate: "new_lead",
    knownContactMatch: knownContact,
  });
  if (!conv.ok) {
    const errText = `conversation_ensure_failed:${conv.error}`;
    await markAutoTextTerminal(supabase, leadId, "failed", { error: errText.slice(0, 2000) });
    console.warn("[facebook-lead-intro-sms] failed", { lead_id: leadId, error: errText });
    return;
  }

  const sms = await sendSms({ to: e164, body, fromOverride });
  const sentAt = new Date().toISOString();

  if (!sms.ok) {
    await markAutoTextTerminal(supabase, leadId, "failed", { error: sms.error.slice(0, 2000) });
    console.warn("[facebook-lead-intro-sms] failed", { lead_id: leadId, error: sms.error.slice(0, 500) });
    return;
  }

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

  await markAutoTextTerminal(supabase, leadId, "sent", { sentAt });
  console.log("[lead-intake] facebook_intro_sms_sent", { lead_id: leadId, message_sid: sms.messageSid });
}

/**
 * Cron / deferred worker: load lead + contact, claim, duplicate-check, send.
 */
export async function dispatchDueFacebookAutoTextForLeadId(supabase: SupabaseClient, leadId: string): Promise<void> {
  const { data: lead, error: lErr } = await supabase
    .from("leads")
    .select("id, contact_id, source, external_source_metadata")
    .eq("id", leadId)
    .maybeSingle();

  if (lErr || !lead?.id || !lead.contact_id) {
    console.warn("[facebook-lead-intro-sms] dispatch missing lead", { lead_id: leadId, error: lErr?.message });
    return;
  }

  if (lead.source !== "facebook" && lead.source !== "facebook_ads") {
    return;
  }

  const { data: contact, error: cErr } = await supabase
    .from("contacts")
    .select("id, first_name, last_name, primary_phone")
    .eq("id", lead.contact_id)
    .maybeSingle();

  if (cErr || !contact?.id) {
    console.warn("[facebook-lead-intro-sms] dispatch missing contact", { lead_id: leadId, error: cErr?.message });
    return;
  }

  const nameParts = {
    first_name: typeof contact.first_name === "string" ? contact.first_name : "",
    last_name: typeof contact.last_name === "string" ? contact.last_name : "",
  };

  let fieldMap = fieldMapFromLeadMetadataGraphFieldData(lead.external_source_metadata);
  if (fieldMap.size === 0) {
    fieldMap = new Map<string, string>();
  }

  const e164 = storedPhoneToE164(typeof contact.primary_phone === "string" ? contact.primary_phone : null);
  if (!e164) {
    const { error: uErr } = await supabase
      .from("leads")
      .update({
        auto_text_status: "skipped",
        auto_text_scheduled_at: null,
        auto_text_sent_at: null,
        ...mirrorLegacyInitialSms("skipped", { error: "invalid_or_missing_phone" }),
      })
      .eq("id", leadId)
      .eq("auto_text_status", "pending");
    if (uErr) {
      console.warn("[facebook-lead-intro-sms] skipped update failed", { lead_id: leadId, error: uErr.message });
    } else {
      console.log("[facebook-lead-intro-sms] skipped", { lead_id: leadId, reason: "invalid_or_missing_phone" });
    }
    return;
  }

  if (await contactHasPriorOutboundSms(supabase, lead.contact_id, e164)) {
    const { error: uErr } = await supabase
      .from("leads")
      .update({
        auto_text_status: "skipped",
        auto_text_scheduled_at: null,
        auto_text_sent_at: null,
        ...mirrorLegacyInitialSms("skipped", { error: "already_contacted_sms" }),
      })
      .eq("id", leadId)
      .eq("auto_text_status", "pending");
    if (uErr) {
      console.warn("[facebook-lead-intro-sms] skipped update failed", { lead_id: leadId, error: uErr.message });
    } else {
      console.log("[facebook-lead-intro-sms] skipped", { lead_id: leadId, reason: "already_contacted_sms" });
    }
    return;
  }

  if (!(await claimLeadForAutoTextSend(supabase, leadId, "deferred"))) {
    return;
  }

  if (await contactHasPriorOutboundSms(supabase, lead.contact_id, e164)) {
    await markAutoTextTerminal(supabase, leadId, "skipped", { error: "already_contacted_sms" });
    console.log("[facebook-lead-intro-sms] skipped", { lead_id: leadId, reason: "already_contacted_sms" });
    return;
  }

  if (!isWithinFacebookAutoTextBusinessHours()) {
    const nextOpen = nextFacebookAutoTextOpenUtc();
    await supabase
      .from("leads")
      .update({
        auto_text_status: "pending",
        auto_text_scheduled_at: nextOpen.toISOString(),
        initial_sms_status: null,
        initial_sms_sent_at: null,
        initial_sms_error: null,
      })
      .eq("id", leadId)
      .eq("auto_text_status", "sending");
    console.log("[facebook-lead-intro-sms] requeued_outside_hours", { lead_id: leadId, auto_text_scheduled_at: nextOpen.toISOString() });
    return;
  }

  try {
    await sendIntroNow(supabase, { leadId, contactId: lead.contact_id, fieldMap, nameParts, e164 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[facebook-lead-intro-sms] unhandled", { lead_id: leadId, error: msg.slice(0, 500) });
    try {
      await supabase
        .from("leads")
        .update({
          auto_text_status: "failed",
          initial_sms_status: "failed",
          initial_sms_error: `unhandled:${msg.slice(0, 1800)}`,
        })
        .eq("id", leadId)
        .eq("auto_text_status", "sending");
    } catch {
      /* ignore */
    }
  }
}

/** Cron: process leads queued with `auto_text_scheduled_at <= now`. */
export async function processDueFacebookAutoTextLeads(supabase: SupabaseClient): Promise<{ processed: number }> {
  const nowIso = new Date().toISOString();
  const { data: rows, error } = await supabase
    .from("leads")
    .select("id")
    .in("source", ["facebook", "facebook_ads"])
    .eq("auto_text_status", "pending")
    .lte("auto_text_scheduled_at", nowIso)
    .order("auto_text_scheduled_at", { ascending: true, nullsFirst: true })
    .limit(75);

  if (error) {
    console.warn("[facebook-auto-text-cron] list failed", error.message);
    return { processed: 0 };
  }

  let n = 0;
  for (const r of rows ?? []) {
    if (r.id) {
      await dispatchDueFacebookAutoTextForLeadId(supabase, String(r.id));
      n += 1;
    }
  }
  return { processed: n };
}

export async function runFacebookLeadIntroSmsAfterInsert(
  supabase: SupabaseClient,
  params: {
    leadId: string;
    contactId: string;
    fieldMap: Map<string, string>;
    nameParts: { first_name: string; last_name: string };
    primaryPhoneStored: string | null;
    ingestionChannel?: "automation" | "csv";
  }
): Promise<void> {
  const { leadId, contactId, fieldMap, nameParts, primaryPhoneStored, ingestionChannel } = params;

  if (ingestionChannel === "csv") {
    return;
  }

  console.log("[lead-intake] facebook_intro_sms_begin", { lead_id: leadId, contact_id_prefix: contactId.slice(0, 8) });

  try {
    const e164 = storedPhoneToE164(primaryPhoneStored);
    if (!e164) {
      const { error: skipErr } = await supabase
        .from("leads")
        .update({
          auto_text_status: "skipped",
          auto_text_scheduled_at: null,
          auto_text_sent_at: null,
          ...mirrorLegacyInitialSms("skipped", { error: "invalid_or_missing_phone" }),
        })
        .eq("id", leadId)
        .is("auto_text_status", null);

      if (skipErr) {
        console.warn("[facebook-lead-intro-sms] skipped update failed", { lead_id: leadId, error: skipErr.message });
      } else {
        console.log("[facebook-lead-intro-sms] skipped", { lead_id: leadId, reason: "invalid_or_missing_phone" });
      }
      return;
    }

    if (await contactHasPriorOutboundSms(supabase, contactId, e164)) {
      const { error: skipErr } = await supabase
        .from("leads")
        .update({
          auto_text_status: "skipped",
          auto_text_scheduled_at: null,
          auto_text_sent_at: null,
          ...mirrorLegacyInitialSms("skipped", { error: "already_contacted_sms" }),
        })
        .eq("id", leadId)
        .is("auto_text_status", null);

      if (skipErr) {
        console.warn("[facebook-lead-intro-sms] skipped update failed", { lead_id: leadId, error: skipErr.message });
      } else {
        console.log("[facebook-lead-intro-sms] skipped", { lead_id: leadId, reason: "already_contacted_sms" });
      }
      return;
    }

    if (!isWithinFacebookAutoTextBusinessHours()) {
      await markDeferredAutoText(supabase, leadId, nextFacebookAutoTextOpenUtc());
      return;
    }

    if (!(await claimLeadForAutoTextSend(supabase, leadId, "immediate"))) {
      return;
    }

    if (await contactHasPriorOutboundSms(supabase, contactId, e164)) {
      await markAutoTextTerminal(supabase, leadId, "skipped", { error: "already_contacted_sms" });
      console.log("[facebook-lead-intro-sms] skipped", { lead_id: leadId, reason: "already_contacted_sms" });
      return;
    }

    await sendIntroNow(supabase, { leadId, contactId, fieldMap, nameParts, e164 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[facebook-lead-intro-sms] unhandled", { lead_id: leadId, error: msg.slice(0, 500) });
    try {
      await supabase
        .from("leads")
        .update({
          auto_text_status: "failed",
          initial_sms_status: "failed",
          initial_sms_error: `unhandled:${msg.slice(0, 1800)}`,
        })
        .eq("id", leadId)
        .eq("auto_text_status", "sending");
    } catch {
      /* ignore */
    }
  }
}
