import type { SupabaseClient } from "@supabase/supabase-js";

import { shouldCreateLeadFromCall } from "@/lib/phone/auto-followup";
import {
  ensureActiveLeadForContact,
  ensureContactLinkedToCall,
  markPhoneCallAsSpam,
  mergeVoiceAiHintsIntoPhoneCallCrm,
} from "@/lib/phone/twilio-voice-intake-crm";
import {
  normalizeVoiceAiPayload,
  persistVoiceAiMetadata,
  type VoiceAiStoredPayload,
} from "@/lib/phone/voice-ai-background";

export type RealtimeRouteIntent =
  | "patient"
  | "referral"
  | "vendor"
  | "wrong_number"
  | "spam"
  | "urgent_medical";

function buildPayloadFromRealtimeIntent(input: {
  intent: RealtimeRouteIntent;
  summary: string;
  transcriptExcerpt: string;
  externalCallId: string;
  callerType?: string;
  callerName?: string;
  patientName?: string;
  callbackNumber?: string;
  urgency?: string;
  handoffRecommended?: boolean;
}): VoiceAiStoredPayload | null {
  const { intent, summary, transcriptExcerpt, externalCallId } = input;
  const fp = `v1-realtime|${externalCallId.trim()}|${Date.now()}`;
  const urgency =
    input.urgency === "low" || input.urgency === "high" || input.urgency === "critical"
      ? input.urgency
      : "medium";
  const callbackNeeded = input.handoffRecommended === true;
  const extraBits = [input.callerName, input.patientName, input.callbackNumber].filter(Boolean).join(" | ");
  const enrichedSummary = extraBits ? `${summary.slice(0, 480)} (${extraBits.slice(0, 120)})` : summary;

  if (intent === "spam") {
    return normalizeVoiceAiPayload(
      {
        caller_category: "spam",
        crm: { type: "spam", outcome: "wrong_number", tags: "openai_realtime", note: "" },
        urgency: "low",
        callback_needed: false,
        short_summary: enrichedSummary.slice(0, 600),
        route_target: "noop",
        confidence: { category: "high", summary: "realtime route_call" },
        closing_message: "",
      },
      fp,
      { source: "live_receptionist", live_transcript_excerpt: transcriptExcerpt.slice(0, 500) }
    );
  }

  if (intent === "referral") {
    return normalizeVoiceAiPayload(
      {
        caller_category: "referral_provider",
        crm: { type: "referral", outcome: "needs_followup", tags: "openai_realtime", note: "" },
        urgency: urgency === "critical" ? "critical" : "high",
        callback_needed: callbackNeeded,
        short_summary: enrichedSummary.slice(0, 600),
        route_target: "referral_team",
        confidence: { category: "high", summary: "realtime route_call" },
        closing_message: "",
      },
      fp,
      { source: "live_receptionist", live_transcript_excerpt: transcriptExcerpt.slice(0, 500) }
    );
  }

  if (intent === "vendor" || intent === "wrong_number") {
    return normalizeVoiceAiPayload(
      {
        caller_category: intent === "vendor" ? "unknown" : "spam",
        crm: {
          type: intent === "vendor" ? "unknown" : "spam",
          outcome: intent === "vendor" ? "needs_followup" : "wrong_number",
          tags: `openai_realtime,${intent}`,
          note: "",
        },
        urgency: urgency === "critical" ? "high" : urgency,
        callback_needed: callbackNeeded,
        short_summary: enrichedSummary.slice(0, 600),
        route_target: intent === "vendor" ? "intake_queue" : "noop",
        confidence: { category: "medium", summary: "realtime route_call" },
        closing_message: "",
      },
      fp,
      { source: "live_receptionist", live_transcript_excerpt: transcriptExcerpt.slice(0, 500) }
    );
  }

  if (intent === "urgent_medical") {
    return normalizeVoiceAiPayload(
      {
        caller_category: "patient_family",
        crm: { type: "patient", outcome: "needs_followup", tags: "openai_realtime,urgent", note: "" },
        urgency: "critical",
        callback_needed: true,
        short_summary: enrichedSummary.slice(0, 600),
        route_target: "intake_queue",
        confidence: { category: "high", summary: "realtime urgent" },
        closing_message: "",
      },
      fp,
      { source: "live_receptionist", live_transcript_excerpt: transcriptExcerpt.slice(0, 500) }
    );
  }

  return normalizeVoiceAiPayload(
    {
      caller_category:
        input.callerType === "referral"
          ? "referral_provider"
          : input.callerType === "spam" || input.callerType === "wrong_number"
            ? "spam"
            : "patient_family",
      crm: { type: "patient", outcome: "needs_followup", tags: "openai_realtime", note: "" },
      urgency,
      callback_needed: callbackNeeded,
      short_summary: enrichedSummary.slice(0, 600),
      route_target: "intake_queue",
      confidence: { category: "high", summary: "realtime route_call" },
      closing_message: "",
    },
    fp,
    { source: "live_receptionist", live_transcript_excerpt: transcriptExcerpt.slice(0, 500) }
  );
}

/**
 * Persist Realtime `route_call` outcome to phone_calls + CRM (aligned with Gather-based voice AI).
 */
export async function persistRealtimeSessionToCrm(
  supabase: SupabaseClient,
  input: {
    externalCallId: string;
    intent: RealtimeRouteIntent;
    summary: string;
    transcriptExcerpt?: string;
    callerType?: string;
    callerName?: string;
    patientName?: string;
    callbackNumber?: string;
    urgency?: string;
    handoffRecommended?: boolean;
  }
): Promise<{ ok: true; callId: string } | { ok: false; error: string }> {
  const ext = input.externalCallId.trim();
  if (!ext) {
    return { ok: false, error: "missing external_call_id" };
  }

  const { data: row, error: findErr } = await supabase
    .from("phone_calls")
    .select("id")
    .eq("external_call_id", ext)
    .maybeSingle();

  if (findErr) {
    return { ok: false, error: findErr.message };
  }
  if (!row?.id) {
    return { ok: false, error: "call not found" };
  }

  const callId = String(row.id);
  const excerpt = (input.transcriptExcerpt ?? input.summary).slice(0, 500);

  const payload = buildPayloadFromRealtimeIntent({
    intent: input.intent,
    summary: input.summary,
    transcriptExcerpt: excerpt,
    externalCallId: ext,
    callerType: input.callerType,
    callerName: input.callerName,
    patientName: input.patientName,
    callbackNumber: input.callbackNumber,
    urgency: input.urgency,
    handoffRecommended: input.handoffRecommended,
  });

  if (!payload) {
    return { ok: false, error: "normalize failed" };
  }

  await persistVoiceAiMetadata(callId, payload);
  const { data: mrow } = await supabase
    .from("phone_calls")
    .select("metadata")
    .eq("id", callId)
    .maybeSingle();
  const meta =
    mrow?.metadata && typeof mrow.metadata === "object" && !Array.isArray(mrow.metadata)
      ? (mrow.metadata as Record<string, unknown>)
      : {};
  await supabase.from("phone_calls").update({
    metadata: {
      ...meta,
      realtime_structured: {
        caller_type: input.callerType ?? null,
        caller_name: input.callerName ?? null,
        patient_name: input.patientName ?? null,
        callback_number: input.callbackNumber ?? null,
        urgency: input.urgency ?? null,
        handoff_recommended: input.handoffRecommended ?? null,
      },
    },
  }).eq("id", callId);

  if (input.intent === "spam") {
    await markPhoneCallAsSpam(callId);
  } else {
    await mergeVoiceAiHintsIntoPhoneCallCrm(callId, payload);
  }

  const contactId = await ensureContactLinkedToCall(callId);
  if (contactId) {
    const { data: leadRow } = await supabase
      .from("phone_calls")
      .select("primary_tag, metadata")
      .eq("id", callId)
      .maybeSingle();

    if (
      leadRow &&
      shouldCreateLeadFromCall({
        primary_tag: leadRow.primary_tag as string | null,
        metadata: leadRow.metadata,
      })
    ) {
      await ensureActiveLeadForContact(contactId);
    }
  }

  return { ok: true, callId };
}
