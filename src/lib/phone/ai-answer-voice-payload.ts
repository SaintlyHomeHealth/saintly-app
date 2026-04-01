import type { AiVoiceRealtimeIntent } from "@/lib/phone/ai-voice-realtime-intent";
import { normalizeVoiceAiPayload, type VoiceAiStoredPayload } from "@/lib/phone/voice-ai-background";

/** Stable fingerprint for single-shot ai-answer/gather classifications. */
export function buildAiAnswerFingerprint(callSid: string, speech: string): string {
  return `v1-ai-answer|${callSid.trim()}|${speech.length}`;
}

export function voicePayloadFromAiAnswerIntent(
  callSid: string,
  intent: AiVoiceRealtimeIntent | null,
  speech: string
): VoiceAiStoredPayload | null {
  const excerpt = speech.trim().slice(0, 500);
  const fp = buildAiAnswerFingerprint(callSid, speech);
  const baseConfidence = { category: "medium" as const, summary: "ai-answer gather intent" };

  if (intent === "spam") {
    return normalizeVoiceAiPayload(
      {
        caller_category: "spam",
        crm: { type: "spam", outcome: "wrong_number", tags: "ai_answer_line", note: "" },
        urgency: "low",
        callback_needed: false,
        short_summary: excerpt ? `Caller (filtered): ${excerpt.slice(0, 200)}` : "Classified as spam on ai-answer line.",
        route_target: "noop",
        confidence: { category: "high", summary: "ai-answer spam" },
        closing_message: "",
      },
      fp,
      { source: "live_receptionist", live_transcript_excerpt: excerpt }
    );
  }

  if (intent === "referral") {
    return normalizeVoiceAiPayload(
      {
        caller_category: "referral_provider",
        crm: { type: "referral", outcome: "needs_followup", tags: "ai_answer_line", note: "" },
        urgency: "high",
        callback_needed: false,
        short_summary: excerpt || "Referral or provider call on ai-answer line.",
        route_target: "referral_team",
        confidence: baseConfidence,
        closing_message: "",
      },
      fp,
      { source: "live_receptionist", live_transcript_excerpt: excerpt }
    );
  }

  if (intent === "urgent_medical") {
    return normalizeVoiceAiPayload(
      {
        caller_category: "patient_family",
        crm: { type: "patient", outcome: "needs_followup", tags: "ai_answer_line,urgent", note: "" },
        urgency: "critical",
        callback_needed: false,
        short_summary: excerpt || "Possible urgent medical concern on ai-answer line.",
        route_target: "intake_queue",
        confidence: { category: "high", summary: "urgent_medical intent" },
        closing_message: "",
      },
      fp,
      { source: "live_receptionist", live_transcript_excerpt: excerpt }
    );
  }

  if (intent === "patient") {
    return normalizeVoiceAiPayload(
      {
        caller_category: "patient_family",
        crm: { type: "patient", outcome: "needs_followup", tags: "ai_answer_line", note: "" },
        urgency: "medium",
        callback_needed: false,
        short_summary: excerpt || "Patient or family call on ai-answer line.",
        route_target: "intake_queue",
        confidence: baseConfidence,
        closing_message: "",
      },
      fp,
      { source: "live_receptionist", live_transcript_excerpt: excerpt }
    );
  }

  return normalizeVoiceAiPayload(
    {
      caller_category: "patient_family",
      crm: { type: "", outcome: "needs_followup", tags: "ai_answer_line,unclear", note: "" },
      urgency: "medium",
      callback_needed: true,
      short_summary: excerpt || "Inbound call on ai-answer line; intent unclear.",
      route_target: "intake_queue",
      confidence: { category: "low", summary: "unclear intent" },
      closing_message: "",
    },
    fp,
    { source: "live_receptionist", live_transcript_excerpt: excerpt }
  );
}

export function buildAiAnswerNoSpeechPayload(callSid: string): VoiceAiStoredPayload {
  const p = normalizeVoiceAiPayload(
    {
      caller_category: "patient_family",
      crm: {
        type: "",
        outcome: "needs_followup",
        tags: "ai_answer_line,no_speech",
        note: "No speech captured on ai-answer gather.",
      },
      urgency: "medium",
      callback_needed: false,
      short_summary: "No usable speech on ai-answer line; staff follow-up recommended.",
      route_target: "intake_queue",
      confidence: { category: "low", summary: "empty gather" },
      closing_message: "",
    },
    `v1-ai-answer-nospeech|${callSid.trim()}`,
    { source: "live_receptionist", live_transcript_excerpt: "" }
  );
  if (!p) {
    throw new Error("buildAiAnswerNoSpeechPayload: normalize failed");
  }
  return p;
}
