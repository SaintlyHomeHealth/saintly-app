import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import type { CrmContactMatch } from "@/lib/crm/find-contact-by-incoming-phone";
import { findContactByIncomingPhone } from "@/lib/crm/find-contact-by-incoming-phone";
import { phoneLookupCandidates } from "@/lib/crm/phone-lookup-candidates";
import { refreshConversationLastMessageAt } from "@/lib/phone/sms-soft-delete";
import { isValidE164, normalizeDialInputToE164 } from "@/lib/softphone/phone-number";

/** Set on conversations.metadata when no CRM contact is linked (inbound or system SMS). */
export const UNKNOWN_TEXTER_METADATA_KEY = "unknown_texter" as const;

export type ConversationMetadata = Record<string, unknown>;

function asMeta(value: unknown): ConversationMetadata {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as ConversationMetadata;
  }
  return {};
}

function formatSupabaseErr(err: { message: string; code?: string; details?: string | null; hint?: string | null } | null): string {
  if (!err?.message) return "unknown error";
  const parts = [err.message.trim()];
  if (err.code) parts.push(`code=${err.code}`);
  if (err.details) parts.push(`details=${String(err.details)}`);
  if (err.hint) parts.push(`hint=${String(err.hint)}`);
  return parts.join(" | ");
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
): Promise<
  | { ok: true; conversationId: string; primaryContactId: string | null }
  | { ok: false; error: string }
> {
  const trimmed = mainPhoneE164.trim();
  const phone =
    normalizeDialInputToE164(trimmed) ?? (isValidE164(trimmed) ? trimmed : "");
  if (!phone || !isValidE164(phone)) {
    console.error("[ensure-sms-conversation] invalid E.164 after normalize", {
      trimmed,
      normalized: phone || null,
    });
    return { ok: false, error: "invalid main_phone_e164" };
  }

  const contactId = matchedContact?.id ?? null;

  const candidates = phoneLookupCandidates(phone);
  if (candidates.length === 0) {
    console.error("[ensure-sms-conversation] no lookup candidates", { phone });
    return { ok: false, error: "no phone lookup candidates" };
  }

  console.log("[ensure-sms-conversation] start", {
    inputTrimmed: trimmed,
    normalizedE164: phone,
    candidates,
    matchedContactId: contactId,
    leadStatusOnCreate: options?.leadStatusOnCreate ?? "(omit, use DB default)",
  });

  const { data: existingRows, error: findErr } = await supabase
    .from("conversations")
    .select("id, primary_contact_id, metadata, main_phone_e164, deleted_at")
    .eq("channel", "sms")
    .in("main_phone_e164", candidates)
    .order("created_at", { ascending: true })
    .limit(2);

  if (findErr) {
    console.error("[ensure-sms-conversation] select existing failed", {
      error: formatSupabaseErr(findErr),
      raw: findErr,
    });
    return { ok: false, error: formatSupabaseErr(findErr) };
  }

  console.log("[ensure-sms-conversation] existing lookup", {
    rowCount: existingRows?.length ?? 0,
    firstId: existingRows?.[0]?.id ?? null,
  });

  const existing = existingRows && existingRows.length > 0 ? existingRows[0] : null;
  if (existingRows && existingRows.length > 1) {
    console.warn("[sms-db] multiple conversations for same logical phone; using oldest", {
      count: existingRows.length,
      keep: existingRows[0]?.id,
    });
  }

  if (existing?.id && existing.main_phone_e164 && existing.main_phone_e164 !== phone) {
    const { error: canonErr } = await supabase
      .from("conversations")
      .update({ main_phone_e164: phone, updated_at: new Date().toISOString() })
      .eq("id", String(existing.id));
    if (canonErr) {
      console.warn("[ensure-sms-conversation] canonicalize main_phone_e164:", formatSupabaseErr(canonErr), canonErr);
    }
  }

  if (existing?.id) {
    const conversationId = String(existing.id);
    const wasDeleted =
      existing.deleted_at != null && String(existing.deleted_at).trim() !== "";
    if (wasDeleted) {
      const { error: reviveErr } = await supabase
        .from("conversations")
        .update({
          deleted_at: null,
          deleted_by_user_id: null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", conversationId);
      if (reviveErr) {
        console.warn("[ensure-sms-conversation] revive deleted thread:", formatSupabaseErr(reviveErr), reviveErr);
      } else {
        await refreshConversationLastMessageAt(supabase, conversationId);
      }
    }
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
        console.warn("[ensure-sms-conversation] link contact:", formatSupabaseErr(linkErr), linkErr);
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
          console.warn("[ensure-sms-conversation] flag unknown:", formatSupabaseErr(metaErr), metaErr);
        }
      }
    }

    const primaryContactId = prevPc ?? (contactId ?? null);

    return { ok: true, conversationId, primaryContactId };
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

  console.log("[ensure-sms-conversation] inserting conversation", {
    payloadKeys: Object.keys(insertPayload),
    channel: insertPayload.channel,
    main_phone_e164: insertPayload.main_phone_e164,
    primary_contact_id: insertPayload.primary_contact_id,
    lead_status: insertPayload.lead_status ?? "(default from DB)",
    metadataKeys: meta && typeof meta === "object" ? Object.keys(meta as object) : [],
  });

  const { data: inserted, error: insErr } = await supabase
    .from("conversations")
    .insert(insertPayload)
    .select("id")
    .single();

  if (insErr || !inserted?.id) {
    console.error("[ensure-sms-conversation] insert failed", {
      formatted: insErr ? formatSupabaseErr(insErr) : "no row",
      raw: insErr ?? null,
      insertPayload,
    });
    return { ok: false, error: insErr ? formatSupabaseErr(insErr) : "insert conversation failed (no id returned)" };
  }

  console.log("[ensure-sms-conversation] insert ok", { conversationId: String(inserted.id) });
  return {
    ok: true,
    conversationId: String(inserted.id),
    primaryContactId: contactId ?? null,
  };
}

/**
 * Resolve CRM + ensure thread for outbound system SMS (e.g. missed-call auto-reply).
 * When `knownContactMatch` is set (e.g. new Facebook lead), skips phone lookup so the thread
 * links immediately to the contact that was just inserted.
 */
export async function ensureSmsConversationForOutboundSystem(
  supabase: SupabaseClient,
  mainPhoneE164: string,
  options?: {
    leadStatusOnCreate?: string;
    /** When set (including null to force re-lookup), skips default lookup only if a non-null match is provided. */
    knownContactMatch?: CrmContactMatch | null;
  }
): Promise<
  | { ok: true; conversationId: string; primaryContactId: string | null }
  | { ok: false; error: string }
> {
  const contact =
    options?.knownContactMatch ??
    (await findContactByIncomingPhone(supabase, mainPhoneE164));
  return ensureSmsConversationForPhone(supabase, mainPhoneE164, contact, {
    leadStatusOnCreate: options?.leadStatusOnCreate ?? "unclassified",
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
    .is("deleted_at", null)
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
