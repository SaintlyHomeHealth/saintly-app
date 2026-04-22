import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import { fetchCrmContactMatchById, findContactByIncomingPhone } from "@/lib/crm/find-contact-by-incoming-phone";
import { isValidCallerIdForPriority } from "@/lib/phone/priority-sms-rules";
import { ensureSmsConversationForPhone } from "@/lib/phone/sms-conversation-thread";
import { isValidE164, normalizeDialInputToE164 } from "@/lib/softphone/phone-number";

function formatVoicemailThreadBody(durationSeconds: number | null | undefined): string {
  if (typeof durationSeconds === "number" && Number.isFinite(durationSeconds) && durationSeconds > 0) {
    const m = Math.floor(durationSeconds / 60);
    const s = durationSeconds % 60;
    const label = m > 0 ? `${m}:${String(s).padStart(2, "0")}` : `0:${String(s).padStart(2, "0")}`;
    return `Voicemail · ${label}`;
  }
  return "Voicemail";
}

function isUniqueViolation(error: { code?: string; message?: string }): boolean {
  if (error.code === "23505") return true;
  return /duplicate key|unique constraint/i.test(error.message || "");
}

/**
 * Idempotent: one `messages` row per voicemail call (unique on phone_call_id + message_type).
 * Links the caller's SMS thread so voicemail appears with SMS history.
 */
export async function ensureVoicemailThreadMessage(
  supabase: SupabaseClient,
  phoneCallId: string
): Promise<void> {
  const callId = phoneCallId.trim();
  if (!callId) return;

  const { data: existing, error: exErr } = await supabase
    .from("messages")
    .select("id")
    .eq("phone_call_id", callId)
    .eq("message_type", "voicemail")
    .maybeSingle();

  if (exErr) {
    console.warn("[voicemail-thread] existing check:", exErr.message);
    return;
  }
  if (existing?.id) return;

  const { data: call, error: callErr } = await supabase
    .from("phone_calls")
    .select("id, direction, from_e164, contact_id, voicemail_recording_sid, voicemail_duration_seconds")
    .eq("id", callId)
    .maybeSingle();

  if (callErr || !call?.id) {
    console.warn("[voicemail-thread] load call:", callErr?.message ?? "missing");
    return;
  }

  const dir = typeof call.direction === "string" ? call.direction.trim().toLowerCase() : "";
  if (dir !== "inbound") return;

  const vmSid = typeof call.voicemail_recording_sid === "string" ? call.voicemail_recording_sid.trim() : "";
  if (!vmSid) return;

  const fromRaw = typeof call.from_e164 === "string" ? call.from_e164.trim() : "";
  const fromE164 = normalizeDialInputToE164(fromRaw);
  if (!fromE164 || !isValidE164(fromE164) || !isValidCallerIdForPriority(fromE164)) {
    return;
  }

  let matched =
    call.contact_id != null && String(call.contact_id).trim() !== ""
      ? await fetchCrmContactMatchById(supabase, String(call.contact_id))
      : null;
  if (!matched) {
    matched = await findContactByIncomingPhone(supabase, fromE164);
  }

  const ensured = await ensureSmsConversationForPhone(supabase, fromE164, matched);
  if (!ensured.ok) {
    console.warn("[voicemail-thread] ensure conversation:", ensured.error);
    return;
  }

  const now = new Date().toISOString();
  const body = formatVoicemailThreadBody(
    typeof call.voicemail_duration_seconds === "number" ? call.voicemail_duration_seconds : null
  );

  const { error: insErr } = await supabase.from("messages").insert({
    conversation_id: ensured.conversationId,
    direction: "inbound",
    body,
    phone_call_id: callId,
    message_type: "voicemail",
    metadata: {
      source: "voicemail_thread",
      phone_call_id: callId,
    },
  });

  if (insErr) {
    if (isUniqueViolation(insErr)) {
      return;
    }
    console.warn("[voicemail-thread] insert:", insErr.message);
    return;
  }

  const { error: touchErr } = await supabase
    .from("conversations")
    .update({ last_message_at: now, updated_at: now })
    .eq("id", ensured.conversationId);

  if (touchErr) {
    console.warn("[voicemail-thread] touch conversation:", touchErr.message);
  }
}
