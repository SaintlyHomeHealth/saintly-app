import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { shouldUseAiReceptionistInbound } from "@/lib/phone/ai-receptionist-gate";
import { upsertPhoneCallFromWebhook } from "@/lib/phone/log-call";
import {
  normalizeVoiceAiPayload,
  persistVoiceAiMetadata,
  type VoiceAiStoredPayload,
} from "@/lib/phone/voice-ai-background";
import { buildLiveInputFingerprint, runLiveReceptionistOpenAi } from "@/lib/phone/voice-ai-live-receptionist";
import {
  applyVoiceIntakeCrmAfterLiveAi,
  isSpamVoicePayload,
  shouldTransferToHumanAfterLiveAi,
} from "@/lib/phone/twilio-voice-intake-crm";
import { buildVoiceHandoffTwiml } from "@/lib/phone/twilio-voice-handoff";
import { parseVerifiedTwilioFormBody } from "@/lib/twilio/verify-form-post";

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Conservative: ignore noise / single-token mis-hears. */
const USABLE_SPEECH_MIN_LEN = 5;

const GREETING_GATHER =
  "Hi, thanks for calling Saintly Home Health — we help families at home. In a sentence or two, are you calling about care for you or a loved one, a referral from a doctor or hospital, or something else?";

const REPROMPT_1 = "Sorry, I didn’t catch that — in a few words, are you a patient or family, a provider with a referral, or something else?";

const THIN_UTTERANCE_MAX_WORDS = 12;

const PATIENT_QUALIFIER_PROMPT = "What city or ZIP is the patient located in?";

function isUsableSpeech(s: string): boolean {
  return s.trim().length >= USABLE_SPEECH_MIN_LEN;
}

function resolvePublicBase(): string {
  return (
    process.env.TWILIO_PUBLIC_BASE_URL?.trim().replace(/\/$/, "") ||
    process.env.TWILIO_WEBHOOK_BASE_URL?.trim().replace(/\/$/, "") ||
    ""
  );
}

function parseGatherAttempt(req: NextRequest): 0 | 1 | 2 {
  const a = req.nextUrl.searchParams.get("attempt");
  if (a === "2") return 2;
  if (a === "1") return 1;
  return 0;
}

function parseIntakePhase(req: NextRequest): 1 | 2 {
  return req.nextUrl.searchParams.get("intake") === "2" ? 2 : 1;
}

function asMetadata(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return {};
}

function transcriptWordCount(speech: string): number {
  const cleaned = speech
    .trim()
    .replace(/[\s.,!?;:]+/g, " ")
    .trim();
  if (!cleaned) return 0;
  return cleaned.split(/\s+/).filter(Boolean).length;
}

/** Patient / family intake — not referral line, not spam. */
function isPatientIntentForThinGather(payload: VoiceAiStoredPayload): boolean {
  if (isSpamVoicePayload(payload)) return false;
  const cat = payload.caller_category.trim().toLowerCase();
  if (cat === "referral_provider") return false;
  if (cat === "patient_family") return true;
  const crmType = payload.crm_suggestion.type.trim().toLowerCase();
  if (crmType === "referral") return false;
  if (crmType === "patient") return true;
  return false;
}

function isUrgentCritical(payload: VoiceAiStoredPayload): boolean {
  return payload.urgency.trim().toLowerCase() === "critical";
}

/**
 * Short patient-family utterance: capture city/ZIP before transfer (intake phase 1 only).
 */
function shouldThinPatientLocationGather(speech: string, payload: VoiceAiStoredPayload): boolean {
  if (!isPatientIntentForThinGather(payload)) return false;
  if (isUrgentCritical(payload)) return false;
  const n = transcriptWordCount(speech);
  return n > 0 && n < THIN_UTTERANCE_MAX_WORDS;
}

function buildNoSpeechIntakePayload(callSid: string): VoiceAiStoredPayload {
  return {
    schema_version: "1.0",
    source: "live_receptionist",
    classified_at: new Date().toISOString(),
    input_fingerprint: `v1-live-nospeech|${callSid.trim()}`,
    caller_category: "patient_family",
    crm_suggestion: {
      type: "",
      outcome: "needs_followup",
      tags: "no_clear_speech,voice_ai",
      note: "Caller did not produce usable speech after prompts on the AI line.",
    },
    urgency: "medium",
    callback_needed: false,
    short_summary:
      "No clear speech captured on the AI receptionist line after retries; staff follow-up recommended.",
    route_target: "intake_queue",
    confidence: { category: "low", summary: "No usable transcript" },
  };
}

function coerceSpamRouting(payload: VoiceAiStoredPayload): VoiceAiStoredPayload {
  if (!isSpamVoicePayload(payload)) return payload;
  return {
    ...payload,
    route_target: "noop",
    callback_needed: false,
  };
}

async function saveAiIntakePendingFirstSpeech(callId: string, speech: string): Promise<void> {
  const { data: row, error: loadErr } = await supabaseAdmin
    .from("phone_calls")
    .select("metadata")
    .eq("id", callId)
    .maybeSingle();

  if (loadErr || !row) {
    console.warn("[ai-receptionist] saveAiIntakePending load:", loadErr?.message);
    return;
  }

  const meta = asMetadata(row.metadata);
  const { error: upErr } = await supabaseAdmin
    .from("phone_calls")
    .update({
      metadata: {
        ...meta,
        ai_intake_pending: { first_speech: speech.slice(0, 2000) },
      },
    })
    .eq("id", callId);

  if (upErr) {
    console.warn("[ai-receptionist] saveAiIntakePending update:", upErr.message);
  }
}

async function takeAiIntakePendingFirstSpeech(callId: string): Promise<string | null> {
  const { data: row, error: loadErr } = await supabaseAdmin
    .from("phone_calls")
    .select("metadata")
    .eq("id", callId)
    .maybeSingle();

  if (loadErr || !row) {
    return null;
  }

  const meta = asMetadata(row.metadata);
  const pending = meta.ai_intake_pending;
  const first =
    pending &&
    typeof pending === "object" &&
    !Array.isArray(pending) &&
    typeof (pending as Record<string, unknown>).first_speech === "string"
      ? String((pending as Record<string, unknown>).first_speech).trim()
      : "";

  const nextMeta = { ...meta };
  delete nextMeta.ai_intake_pending;

  const { error: upErr } = await supabaseAdmin
    .from("phone_calls")
    .update({ metadata: nextMeta })
    .eq("id", callId);

  if (upErr) {
    console.warn("[ai-receptionist] clearAiIntakePending:", upErr.message);
  }

  return first.length > 0 ? first : null;
}

/**
 * Twilio: Gather uses ?attempt=1 / ?attempt=2; empty/short speech reprompts once, then fallback (dial or callback copy).
 * Optional ?intake=2 — second qualifying question for thin patient utterances.
 */
export async function POST(req: NextRequest) {
  const parsed = await parseVerifiedTwilioFormBody(req);
  if (!parsed.ok) {
    return parsed.response;
  }

  const params = parsed.params;
  const callSid = params.CallSid?.trim() ?? "";
  const from = params.From?.trim() ?? "";
  const to = params.To?.trim() ?? "";
  const speech = (params.SpeechResult ?? params.UnstableSpeechResult ?? "").trim();
  const attempt = parseGatherAttempt(req);
  const intakePhase = parseIntakePhase(req);

  if (!callSid || !from || !to) {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">We are sorry, this call could not be connected.</Say></Response>`;
    return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }

  const publicBase = resolvePublicBase();

  /** Defense-in-depth: live AI receptionist disabled → normal inbound ring (no stale Gather → AI). */
  if (!shouldUseAiReceptionistInbound(from)) {
    if (publicBase) {
      const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Redirect method="POST">${escapeXml(
        `${publicBase}/api/twilio/voice/inbound-ring`
      )}</Redirect></Response>`;
      return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
    }
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">Please try your call again.</Say></Response>`;
    return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }
  const gatherActionBase = publicBase ? `${publicBase}/api/twilio/voice/ai-receptionist/step` : "";
  const ringE164 = process.env.TWILIO_VOICE_RING_E164?.trim() ?? "";
  const callerId = to;

  const { data: callRow, error: callErr } = await supabaseAdmin
    .from("phone_calls")
    .select("id")
    .eq("external_call_id", callSid)
    .maybeSingle();

  if (callErr) {
    console.warn("[twilio/voice/ai-receptionist] phone_calls lookup:", callErr.message);
  }

  let callId: string | null = typeof callRow?.id === "string" ? callRow.id : null;
  if (!callId) {
    const ensured = await upsertPhoneCallFromWebhook(supabaseAdmin, {
      external_call_id: callSid,
      direction: "inbound",
      from_e164: from,
      to_e164: to,
      status: "in_progress",
      event_type: "call.ai_receptionist",
      started_at: new Date().toISOString(),
      metadata: { source: "twilio_voice_ai_receptionist_step" },
    });
    if (ensured.ok) {
      callId = ensured.callId;
    } else {
      console.warn("[ai-receptionist] ensure phone_calls row failed:", ensured.error);
    }
  }

  /** Intake round 2: empty speech → finalize like exhausted reprompts. */
  if (intakePhase === 2 && !isUsableSpeech(speech)) {
    if (callId) {
      await takeAiIntakePendingFirstSpeech(callId);
      const minimal = buildNoSpeechIntakePayload(callSid);
      await persistVoiceAiMetadata(callId, minimal);
      await applyVoiceIntakeCrmAfterLiveAi(callId, minimal);
    }

    const closingNoSpeech =
      ringE164 || publicBase
        ? "We could not hear you clearly. Connecting you to our team now."
        : "We could not hear you clearly. Someone will follow up during business hours. Thank you for calling Saintly Home Health. Goodbye.";

    const handoff = publicBase
      ? await buildVoiceHandoffTwiml({
          closing: closingNoSpeech,
          publicBase,
          callerId,
          ringE164,
        })
      : null;
    if (handoff) {
      return new NextResponse(handoff, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${escapeXml(closingNoSpeech)}</Say>
</Response>`.trim();
    return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }

  /** Silence, timeout, or too-short transcription → at most one reprompt (intake phase 1 only). */
  if (intakePhase === 1 && !isUsableSpeech(speech)) {
    if (!gatherActionBase) {
      const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">Please try again later.</Say></Response>`;
      return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
    }

    if (attempt === 0) {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" timeout="8" speechTimeout="auto" action="${escapeXml(`${gatherActionBase}?attempt=1`)}" method="POST" language="en-US">
    <Say voice="Polly.Joanna">${escapeXml(GREETING_GATHER)}</Say>
  </Gather>
  <Say voice="Polly.Joanna">We did not hear you. Please call back or leave a message. Goodbye.</Say>
</Response>`.trim();
      return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
    }

    if (attempt === 1) {
      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" timeout="8" speechTimeout="auto" action="${escapeXml(`${gatherActionBase}?attempt=2`)}" method="POST" language="en-US">
    <Say voice="Polly.Joanna">${escapeXml(REPROMPT_1)}</Say>
  </Gather>
  <Say voice="Polly.Joanna">We still could not hear you. Goodbye.</Say>
</Response>`.trim();
      return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
    }

    const closingNoSpeech =
      ringE164 || publicBase
        ? "We could not hear you clearly. Connecting you to our team now."
        : "We could not hear you clearly. Someone will follow up during business hours. Thank you for calling Saintly Home Health. Goodbye.";

    if (callId) {
      const minimal = buildNoSpeechIntakePayload(callSid);
      await persistVoiceAiMetadata(callId, minimal);
      await applyVoiceIntakeCrmAfterLiveAi(callId, minimal);
    }

    if (ringE164 || publicBase) {
      const handoff = publicBase
        ? await buildVoiceHandoffTwiml({
            closing: closingNoSpeech,
            publicBase,
            callerId,
            ringE164,
          })
        : null;
      if (handoff) {
        return new NextResponse(handoff, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
      }
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${escapeXml(closingNoSpeech)}</Say>
</Response>`.trim();
    return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }

  let speechForModel = speech;
  if (intakePhase === 2 && callId) {
    const first = await takeAiIntakePendingFirstSpeech(callId);
    if (first) {
      speechForModel = `${first}\n\nFollow-up detail:\n${speech}`;
    }
  }

  const fingerprint = buildLiveInputFingerprint(callSid, speechForModel);
  const raw = await runLiveReceptionistOpenAi(speechForModel, from, to);

  let payload: VoiceAiStoredPayload | null = null;
  if (raw != null) {
    payload = normalizeVoiceAiPayload(raw, fingerprint, {
      source: "live_receptionist",
      live_transcript_excerpt: speechForModel.slice(0, 500),
    });
  }

  if (payload) {
    payload = coerceSpamRouting(payload);
  }

  /**
   * Short non-urgent patient intent: always ask for location before classify+route (phase 2).
   * Do not require shouldTransferToHumanAfterLiveAi — model may still route intake after round 2.
   */
  if (
    intakePhase === 1 &&
    callId &&
    gatherActionBase &&
    payload &&
    shouldThinPatientLocationGather(speech, payload)
  ) {
    const wc = transcriptWordCount(speech);
    console.log("[ai-receptionist] thin utterance follow-up triggered", {
      callSid,
      wordCount: wc,
      caller_category: payload.caller_category,
      crm_type: payload.crm_suggestion.type,
      urgency: payload.urgency,
    });
    await saveAiIntakePendingFirstSpeech(callId, speech);
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" timeout="8" speechTimeout="auto" action="${escapeXml(`${gatherActionBase}?intake=2`)}" method="POST" language="en-US">
    <Say voice="Polly.Joanna">${escapeXml(PATIENT_QUALIFIER_PROMPT)}</Say>
  </Gather>
</Response>`.trim();
    return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }

  if (callId && payload) {
    await persistVoiceAiMetadata(callId, payload);
    await applyVoiceIntakeCrmAfterLiveAi(callId, payload);
  }

  const canHandoffToStaff = Boolean(ringE164 || publicBase);

  let closing = payload?.closing_message?.trim() ?? "";
  if (!closing) {
    if (!payload && canHandoffToStaff) {
      closing = "Connecting you to our team now.";
    } else if (payload && shouldTransferToHumanAfterLiveAi(payload) && canHandoffToStaff) {
      closing = "Thank you — connecting you now.";
    } else {
      closing = "Thank you for calling Saintly Home Health. We will follow up if needed. Goodbye.";
    }
  }

  if (payload && isSpamVoicePayload(payload)) {
    const spamClosing = closing || "We cannot help with this call. Goodbye.";
    const body = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${escapeXml(spamClosing)}</Say>
  <Hangup/>
</Response>`.trim();
    return new NextResponse(body, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }

  const dialHuman = Boolean(payload && shouldTransferToHumanAfterLiveAi(payload));
  const fallbackDial = Boolean(!payload && canHandoffToStaff);

  let body: string;
  const needsHandoffDial = fallbackDial || (dialHuman && canHandoffToStaff);
  if (needsHandoffDial && publicBase) {
    const handoff = await buildVoiceHandoffTwiml({
      closing,
      publicBase,
      callerId,
      ringE164,
    });
    if (handoff) {
      body = handoff;
    } else {
      body = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${escapeXml(closing)}</Say>
</Response>`.trim();
    }
  } else {
    body = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${escapeXml(closing)}</Say>
</Response>`.trim();
  }

  return new NextResponse(body, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
}
