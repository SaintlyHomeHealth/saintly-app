import type { SupabaseClient } from "@supabase/supabase-js";

import { isValidCallerIdForPriority } from "@/lib/phone/priority-sms-rules";
import {
  appendOutboundSmsToConversation,
  ensureSmsConversationForOutboundSystem,
  hasRecentMissedCallAutoReplyToPhone,
} from "@/lib/phone/sms-conversation-thread";
import {
  ensureActiveLeadForContact,
  ensureContactLinkedToCall,
} from "@/lib/phone/twilio-voice-intake-crm";
import { sendSms } from "@/lib/twilio/send-sms";
import { FOLLOWUP_SMS_COOLDOWN_MS } from "@/lib/phone/voice-ai-callback-sms";

const DUPLICATE_KEY = "23505";

function isUniqueViolation(error: { code?: string; message?: string }): boolean {
  if (error.code === DUPLICATE_KEY) return true;
  return /duplicate key|unique constraint/i.test(error.message || "");
}

function asMetadata(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

type PhoneCallForLeadQualification = {
  primary_tag?: string | null;
  metadata: unknown;
};

/**
 * Leads only when classification clearly indicates intake/referral/caregiver — keeps CRM clean for generic missed calls.
 */
export function shouldCreateLeadFromCall(phoneCall: PhoneCallForLeadQualification): boolean {
  const meta = asMetadata(phoneCall.metadata);
  const voiceAiRaw = meta.voice_ai;
  const voiceAi =
    voiceAiRaw && typeof voiceAiRaw === "object" && !Array.isArray(voiceAiRaw)
      ? (voiceAiRaw as Record<string, unknown>)
      : null;

  const crmRaw = meta.crm;
  const crm =
    crmRaw && typeof crmRaw === "object" && !Array.isArray(crmRaw)
      ? (crmRaw as Record<string, unknown>)
      : null;

  const pt = String(phoneCall.primary_tag ?? "").trim().toLowerCase();
  const crmType = String(crm?.type ?? "").trim().toLowerCase();
  const vaCat = String(voiceAi?.caller_category ?? "").trim().toLowerCase();

  if (pt === "spam" || crmType === "spam" || vaCat === "spam") {
    return false;
  }

  const vaCrmRaw = voiceAi?.crm_suggestion;
  const vaCrm =
    vaCrmRaw && typeof vaCrmRaw === "object" && !Array.isArray(vaCrmRaw)
      ? (vaCrmRaw as Record<string, unknown>)
      : null;
  const vaCrmType = String(vaCrm?.type ?? "").trim().toLowerCase();
  if (vaCrmType === "spam") {
    return false;
  }

  if (
    vaCat === "patient_family" ||
    vaCat === "referral_provider" ||
    crmType === "patient" ||
    crmType === "referral" ||
    crmType === "caregiver"
  ) {
    return true;
  }

  if (vaCrmType === "patient" || vaCrmType === "referral" || vaCrmType === "caregiver") {
    return true;
  }

  return false;
}

export const AUTO_FOLLOWUP_SMS_BODY =
  "Hi this is Saintly Home Health — we missed your call. What services are you looking for?";

function isTerminalPhoneStatusLocal(status: string): boolean {
  const s = status.trim().toLowerCase();
  return (
    s === "completed" ||
    s === "missed" ||
    s === "abandoned" ||
    s === "failed" ||
    s === "cancelled"
  );
}

function isSpamCallRow(row: {
  primary_tag?: string | null;
  metadata: unknown;
}): boolean {
  const pt = (row.primary_tag ?? "").trim().toLowerCase();
  if (pt === "spam") return true;

  const meta = asMetadata(row.metadata);
  const crm = meta.crm;
  if (crm && typeof crm === "object" && !Array.isArray(crm)) {
    const t = String((crm as Record<string, unknown>).type ?? "").trim().toLowerCase();
    if (t === "spam") return true;
  }

  const va = meta.voice_ai;
  if (va && typeof va === "object" && !Array.isArray(va)) {
    const v = va as Record<string, unknown>;
    const cat = String(v.caller_category ?? "").trim().toLowerCase();
    if (cat === "spam") return true;
    const crmSub = v.crm_suggestion;
    if (crmSub && typeof crmSub === "object" && !Array.isArray(crmSub)) {
      const ct = String((crmSub as Record<string, unknown>).type ?? "").trim().toLowerCase();
      if (ct === "spam") return true;
    }
  }

  return false;
}

function voiceAiIndicatesNoSpeech(metadata: unknown): boolean {
  const meta = asMetadata(metadata);
  const va = meta.voice_ai;
  if (!va || typeof va !== "object" || Array.isArray(va)) return false;
  const v = va as Record<string, unknown>;
  const crm = v.crm_suggestion;
  let tags = "";
  if (crm && typeof crm === "object" && !Array.isArray(crm)) {
    const t = (crm as Record<string, unknown>).tags;
    if (typeof t === "string") tags = t.toLowerCase();
  }
  if (tags.includes("no_clear_speech") || tags.includes("no_speech")) return true;
  const sum = typeof v.short_summary === "string" ? v.short_summary.toLowerCase() : "";
  if (sum.includes("no clear speech") || sum.includes("no usable speech")) return true;
  const fp = typeof v.input_fingerprint === "string" ? v.input_fingerprint.toLowerCase() : "";
  if (fp.includes("nospeech") || fp.includes("no_speech")) return true;
  return false;
}

function followUpStatusNeeded(metadata: unknown): boolean {
  const meta = asMetadata(metadata);
  const s = meta.follow_up_status;
  return typeof s === "string" && s.trim().toLowerCase() === "needed";
}

function autoFollowupSent(metadata: unknown): boolean {
  const meta = asMetadata(metadata);
  if (meta.auto_followup_sent === true) return true;
  const nested = meta.auto_followup;
  if (nested && typeof nested === "object" && !Array.isArray(nested)) {
    return (nested as Record<string, unknown>).sent === true;
  }
  return false;
}

function autoFollowupPipelineDone(metadata: unknown): boolean {
  const meta = asMetadata(metadata);
  return meta.auto_followup_completed === true;
}

function shouldOfferSmsForAutoFollowup(row: {
  metadata: unknown;
  voicemail_recording_sid: string | null | undefined;
  auto_reply_sms_sent_at: string | null | undefined;
}): boolean {
  if (autoFollowupSent(row.metadata)) return false;
  if (row.auto_reply_sms_sent_at) return false;
  const vm = (row.voicemail_recording_sid ?? "").trim();
  if (vm !== "") return false;
  return true;
}

function isEligibleTriggerStatus(status: string): boolean {
  const s = status.trim().toLowerCase();
  return s === "missed" || s === "abandoned" || s === "failed" || s === "cancelled";
}

/**
 * Inbound terminal calls: missed / unhandled, or voice_ai no-speech / explicit follow_up_status,
 * excluding spam. Does not treat generic "completed" as eligible unless no-speech / follow-up flag.
 */
export function isEligibleForAutoFollowUp(row: {
  direction: string | null | undefined;
  status: string | null | undefined;
  metadata: unknown;
  primary_tag?: string | null | undefined;
}): boolean {
  const dir = (row.direction ?? "").trim().toLowerCase();
  if (dir !== "inbound") return false;

  const status = (row.status ?? "").trim().toLowerCase();
  if (!isTerminalPhoneStatusLocal(status)) return false;

  if (isSpamCallRow({ primary_tag: row.primary_tag, metadata: row.metadata })) return false;

  if (followUpStatusNeeded(row.metadata)) return true;
  if (voiceAiIndicatesNoSpeech(row.metadata)) return true;
  if (isEligibleTriggerStatus(status)) return true;

  return false;
}

async function mergeAutoFollowupMetadata(
  supabase: SupabaseClient,
  callId: string,
  patch: Record<string, unknown>
): Promise<void> {
  const { data: row, error: readErr } = await supabase
    .from("phone_calls")
    .select("metadata")
    .eq("id", callId)
    .maybeSingle();

  if (readErr || !row) {
    console.warn("[auto-followup] merge metadata read:", readErr?.message);
    return;
  }

  const prev = asMetadata(row.metadata);
  const { error: upErr } = await supabase
    .from("phone_calls")
    .update({
      metadata: {
        ...prev,
        ...patch,
      },
    })
    .eq("id", callId);

  if (upErr) {
    console.warn("[auto-followup] merge metadata update:", upErr.message);
  }
}

/**
 * SMS + CRM contact/lead + callback task for missed/unhandled inbound calls.
 * Idempotent: duplicate task insert still allows SMS/metadata if a prior run stopped mid-flight.
 * Run after terminal status + voice AI classification (spam detection) on the call row.
 */
export async function triggerAutoFollowUp(
  supabase: SupabaseClient,
  phoneCallId: string
): Promise<void> {
  const callId = phoneCallId.trim();
  if (!callId) return;

  const { data: row, error: selErr } = await supabase
    .from("phone_calls")
    .select(
      "id, direction, status, from_e164, metadata, primary_tag, voicemail_recording_sid, auto_reply_sms_sent_at, assigned_to_user_id"
    )
    .eq("id", callId)
    .maybeSingle();

  if (selErr || !row?.id) {
    console.warn("[auto-followup] load call:", selErr?.message);
    return;
  }

  if (autoFollowupPipelineDone(row.metadata)) {
    return;
  }

  if (!isEligibleForAutoFollowUp(row)) {
    return;
  }

  console.log("[auto-followup] triggered", { callId });

  const assignTo =
    row.assigned_to_user_id != null && String(row.assigned_to_user_id).trim() !== ""
      ? String(row.assigned_to_user_id)
      : null;

  const { error: taskErr } = await supabase.from("phone_call_tasks").insert({
    phone_call_id: callId,
    title: "Auto follow-up: callback",
    description: "Auto follow-up from missed call",
    status: "open",
    priority: "high",
    assigned_to_user_id: assignTo,
    created_by_user_id: null,
    source: "auto_followup",
  });

  if (taskErr && !isUniqueViolation(taskErr)) {
    console.warn("[auto-followup] task insert:", taskErr.message);
    return;
  }

  const contactId = await ensureContactLinkedToCall(callId);
  if (contactId && shouldCreateLeadFromCall(row)) {
    await ensureActiveLeadForContact(contactId);
    console.log("[auto-followup] lead ensured", { callId, contactId });
  }

  const fromE164 = typeof row.from_e164 === "string" ? row.from_e164.trim() : "";
  const allowSms = shouldOfferSmsForAutoFollowup(row);

  const metaPatch: Record<string, unknown> = {};
  let markPipelineComplete = true;

  if (allowSms && isValidCallerIdForPriority(fromE164)) {
    const recent = await hasRecentMissedCallAutoReplyToPhone(supabase, fromE164, FOLLOWUP_SMS_COOLDOWN_MS);
    if (recent) {
      console.warn("[auto-followup] sms cooldown skip", { callId, to: fromE164.slice(0, 6) });
    } else {
      const result = await sendSms({ to: fromE164, body: AUTO_FOLLOWUP_SMS_BODY });
      if (!result.ok) {
        console.error("[auto-followup] sendSms:", result.error);
        markPipelineComplete = false;
        metaPatch.auto_followup_sms_last_error = String(result.error).slice(0, 500);
        metaPatch.auto_followup_sms_last_attempt_at = new Date().toISOString();
      } else {
        console.log("[auto-followup] sms sent", { callId });
        const ensured = await ensureSmsConversationForOutboundSystem(supabase, fromE164);
        if (!ensured.ok) {
          console.error("[auto-followup] ensure conversation:", ensured.error);
        } else {
          await appendOutboundSmsToConversation(supabase, {
            conversationId: ensured.conversationId,
            body: AUTO_FOLLOWUP_SMS_BODY,
            messageSid: result.messageSid,
            metadata: {
              source: "auto_followup",
              phone_call_id: callId,
            },
            phoneCallId: callId,
          });
        }

        const sentAt = new Date().toISOString();
        await supabase
          .from("phone_calls")
          .update({
            auto_reply_sms_sent_at: sentAt,
            auto_reply_sms_body: AUTO_FOLLOWUP_SMS_BODY,
          })
          .eq("id", callId)
          .is("auto_reply_sms_sent_at", null);

        metaPatch.auto_followup_sent = true;
        metaPatch.auto_followup_sms_sent_at = sentAt;
      }
    }
  }

  if (markPipelineComplete) {
    metaPatch.auto_followup_completed = true;
    metaPatch.auto_followup_completed_at = new Date().toISOString();
  }

  if (Object.keys(metaPatch).length > 0) {
    await mergeAutoFollowupMetadata(supabase, callId, metaPatch);
  }
}
