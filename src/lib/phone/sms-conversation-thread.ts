import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { CrmContactMatch } from "@/lib/crm/find-contact-by-incoming-phone";
import { findContactByIncomingPhone } from "@/lib/crm/find-contact-by-incoming-phone";
import { isValidE164 } from "@/lib/softphone/phone-number";

/** Set on conversations.metadata when no CRM contact is linked (inbound or system SMS). */
export const UNKNOWN_TEXTER_METADATA_KEY = "unknown_texter" as const;

export type ConversationMetadata = Record<string, unknown>;

function asMeta(value: unknown): ConversationMetadata {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as ConversationMetadata;
  }
  return {};
}

/**
 * Find or create the SMS thread for a number. Links CRM when matched; flags unknown texters in metadata.
 */
export async function ensureSmsConversationForPhone(
  supabase: SupabaseClient,
  mainPhoneE164: string,
  matchedContact: CrmContactMatch | null,
  options?: {
    /** For system/outbound SMS threads (e.g. missed-call auto-reply). */
    leadStatusOnCreate?: string;
  }
): Promise<{ ok: true; conversationId: string } | { ok: false; error: string }> {
  const phone = mainPhoneE164.trim();
  if (!phone || !isValidE164(phone)) {
    return { ok: false, error: "invalid main_phone_e164" };
  }

  const contactId = matchedContact?.id ?? null;

  const { data: existing, error: findErr } = await supabase
    .from("conversations")
    .select("id, primary_contact_id, metadata")
    .eq("channel", "sms")
    .eq("main_phone_e164", phone)
    .maybeSingle();

  if (findErr) {
    return { ok: false, error: findErr.message };
  }

  if (existing?.id) {
    const conversationId = String(existing.id);
    const prevPc =
      existing.primary_contact_id != null && String(existing.primary_contact_id).trim() !== ""
        ? String(existing.primary_contact_id)
        : null;

    if (!prevPc && contactId) {
      const { error: linkErr } = await supabase
        .from("conversations")
        .update({
          primary_contact_id: contactId,
          updated_at: new Date().toISOString(),
        })
        .eq("id", conversationId)
        .is("primary_contact_id", null);

      if (linkErr) {
        console.warn("[sms-thread] link contact:", linkErr.message);
      }
    }

    if (!prevPc && !contactId) {
      const meta = asMeta(existing.metadata);
      if (meta[UNKNOWN_TEXTER_METADATA_KEY] !== true) {
        const nextMeta = {
          ...meta,
          [UNKNOWN_TEXTER_METADATA_KEY]: true,
          auto_intake_at: new Date().toISOString(),
        };
        const { error: metaErr } = await supabase
          .from("conversations")
          .update({ metadata: nextMeta, updated_at: new Date().toISOString() })
          .eq("id", conversationId);

        if (metaErr) {
          console.warn("[sms-thread] flag unknown:", metaErr.message);
        }
      }
    }

    return { ok: true, conversationId };
  }

  const now = new Date().toISOString();
  const meta: ConversationMetadata = {};
  if (!contactId) {
    meta[UNKNOWN_TEXTER_METADATA_KEY] = true;
    meta.auto_intake_at = now;
  }

  const insertPayload: Record<string, unknown> = {
    channel: "sms",
    main_phone_e164: phone,
    primary_contact_id: contactId,
    metadata: meta,
  };

  if (options?.leadStatusOnCreate) {
    insertPayload.lead_status = options.leadStatusOnCreate;
  }

  const { data: inserted, error: insErr } = await supabase
    .from("conversations")
    .insert(insertPayload)
    .select("id")
    .single();

  if (insErr || !inserted?.id) {
    return { ok: false, error: insErr?.message ?? "insert conversation failed" };
  }

  return { ok: true, conversationId: String(inserted.id) };
}

/**
 * Resolve CRM + ensure thread for outbound system SMS (e.g. missed-call auto-reply).
 */
export async function ensureSmsConversationForOutboundSystem(
  supabase: SupabaseClient,
  mainPhoneE164: string
): Promise<{ ok: true; conversationId: string } | { ok: false; error: string }> {
  const contact = await findContactByIncomingPhone(supabase, mainPhoneE164);
  return ensureSmsConversationForPhone(supabase, mainPhoneE164, contact, {
    leadStatusOnCreate: "unclassified",
  });
}

/** True if an outbound missed-call auto-reply was logged recently for this number (anti-spam). */
export async function hasRecentMissedCallAutoReplyToPhone(
  supabase: SupabaseClient,
  mainPhoneE164: string,
  windowMs: number
): Promise<boolean> {
  const phone = mainPhoneE164.trim();
  if (!phone) return false;

  const { data: conv, error: cErr } = await supabase
    .from("conversations")
    .select("id")
    .eq("channel", "sms")
    .eq("main_phone_e164", phone)
    .maybeSingle();

  if (cErr || !conv?.id) {
    return false;
  }

  const cutoff = new Date(Date.now() - windowMs).toISOString();
  const { data: rows, error: mErr } = await supabase
    .from("messages")
    .select("id, metadata")
    .eq("conversation_id", String(conv.id))
    .eq("direction", "outbound")
    .gte("created_at", cutoff)
    .limit(25);

  if (mErr) {
    console.warn("[sms-thread] cooldown scan:", mErr.message);
    return false;
  }

  for (const r of rows ?? []) {
    const m = asMeta(r.metadata);
    if (m.source === "missed_call_auto_reply" || m.source === "voice_ai_callback_followup") {
      return true;
    }
  }
  return false;
}

export async function appendOutboundSmsToConversation(
  supabase: SupabaseClient,
  input: {
    conversationId: string;
    body: string;
    messageSid: string;
    metadata: Record<string, unknown>;
    phoneCallId?: string | null;
  }
): Promise<{ ok: true } | { ok: false; error: string }> {
  const now = new Date().toISOString();

  const row: Record<string, unknown> = {
    conversation_id: input.conversationId,
    direction: "outbound",
    body: input.body.slice(0, 32000),
    external_message_sid: input.messageSid,
    metadata: input.metadata,
  };
  if (input.phoneCallId) {
    row.phone_call_id = input.phoneCallId;
  }

  const { error: msgErr } = await supabase.from("messages").insert(row);

  if (msgErr) {
    const code = msgErr.code != null ? String(msgErr.code) : "";
    if (code === "23505") {
      return { ok: true };
    }
    return { ok: false, error: msgErr.message };
  }

  const { error: touchErr } = await supabase
    .from("conversations")
    .update({ last_message_at: now, updated_at: now })
    .eq("id", input.conversationId);

  if (touchErr) {
    console.warn("[sms-thread] last_message_at:", touchErr.message);
  }

  return { ok: true };
}
