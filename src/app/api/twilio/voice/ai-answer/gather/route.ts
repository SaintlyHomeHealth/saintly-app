import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import {
  buildAiAnswerNoSpeechPayload,
  voicePayloadFromAiAnswerIntent,
} from "@/lib/phone/ai-answer-voice-payload";
import {
  type AiVoiceRealtimeIntent,
  classifyAiVoiceRealtimeIntent,
} from "@/lib/phone/ai-voice-realtime-intent";
import { applyVoiceIntakeCrmAfterLiveAi, isSpamVoicePayload } from "@/lib/phone/twilio-voice-intake-crm";
import { buildVoiceHandoffTwiml } from "@/lib/phone/twilio-voice-handoff";
import { persistVoiceAiMetadata } from "@/lib/phone/voice-ai-background";
import { parseVerifiedTwilioFormBody } from "@/lib/twilio/verify-form-post";

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function resolvePublicBase(): string {
  return (
    process.env.TWILIO_PUBLIC_BASE_URL?.trim().replace(/\/$/, "") ||
    process.env.TWILIO_WEBHOOK_BASE_URL?.trim().replace(/\/$/, "") ||
    ""
  );
}

function resolveStaffRingE164(): string {
  return process.env.TWILIO_VOICE_RING_E164?.trim() ?? "";
}

function resolvePriorityRingE164(): string {
  const p = process.env.TWILIO_VOICE_PRIORITY_E164?.trim();
  if (p) return p;
  return resolveStaffRingE164();
}

async function resolvePhoneCallId(callSid: string): Promise<string | null> {
  const { data, error } = await supabaseAdmin
    .from("phone_calls")
    .select("id")
    .eq("external_call_id", callSid.trim())
    .maybeSingle();
  if (error) {
    console.warn("[ai-voice] gather phone_calls lookup:", error.message);
    return null;
  }
  return typeof data?.id === "string" ? data.id : null;
}

function resolveRoutingDecision(intent: AiVoiceRealtimeIntent | null): {
  intent: AiVoiceRealtimeIntent | "fallback_staff";
  dialE164: string | null;
  hangup: boolean;
} {
  if (intent === "spam") {
    return { intent: "spam", dialE164: null, hangup: true };
  }
  if (intent === "urgent_medical") {
    const e164 = resolvePriorityRingE164();
    return { intent: "urgent_medical", dialE164: e164 || null, hangup: false };
  }
  if (intent === "patient" || intent === "referral") {
    const e164 = resolveStaffRingE164();
    return { intent, dialE164: e164 || null, hangup: false };
  }
  const staff = resolveStaffRingE164();
  return { intent: "fallback_staff", dialE164: staff || null, hangup: false };
}

export async function POST(req: NextRequest) {
  const parsed = await parseVerifiedTwilioFormBody(req);
  if (!parsed.ok) {
    return parsed.response;
  }

  const params = parsed.params;
  const callSid = params.CallSid?.trim() ?? "";
  const speechResult = (params.SpeechResult ?? "").trim();
  const from = params.From?.trim() ?? "";
  const to = params.To?.trim() ?? "";

  console.log("[ai-voice] gather callback", { callSid, from, to, speechLen: speechResult.length });

  const publicBase = resolvePublicBase();
  const callerId = to || from;

  const callId = callSid ? await resolvePhoneCallId(callSid) : null;

  if (!speechResult) {
    console.log("[ai-voice] transcript (empty)");
    if (callId) {
      try {
        const minimal = buildAiAnswerNoSpeechPayload(callSid);
        await persistVoiceAiMetadata(callId, minimal);
        await applyVoiceIntakeCrmAfterLiveAi(callId, minimal);
      } catch (e) {
        console.warn("[ai-voice] no-speech CRM persist:", e);
      }
    }
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${escapeXml(
    "We did not catch that. Our team will follow up during business hours. Thank you for calling Saintly Home Health. Goodbye."
  )}</Say>
  <Hangup/>
</Response>`.trim();
    return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }

  console.log("[ai-voice] transcript", { callSid, excerpt: speechResult.slice(0, 240) });

  let intent: AiVoiceRealtimeIntent | null = null;
  try {
    intent = await classifyAiVoiceRealtimeIntent(speechResult);
  } catch (e) {
    console.warn("[ai-voice] classification error", e);
  }

  console.log("[ai-voice] classification", { callSid, intent });

  const voicePayload = voicePayloadFromAiAnswerIntent(callSid, intent, speechResult);
  if (callId && voicePayload) {
    await persistVoiceAiMetadata(callId, voicePayload);
    await applyVoiceIntakeCrmAfterLiveAi(callId, voicePayload);
  }

  const route = resolveRoutingDecision(intent);

  if (route.hangup || (voicePayload && isSpamVoicePayload(voicePayload))) {
    console.log("[ai-voice] routing decision", { callSid, decision: "hangup_spam" });
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${escapeXml("Goodbye.")}</Say>
  <Hangup/>
</Response>`.trim();
    return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }

  if (!route.dialE164) {
    console.log("[ai-voice] routing decision", { callSid, decision: "no_dial_target_configured" });
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">${escapeXml(
      "We could not complete your call. Please try again later."
    )}</Say><Hangup/></Response>`;
    return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }

  if (!publicBase) {
    console.log("[ai-voice] routing decision", { callSid, decision: "no_public_base_for_dial_callbacks" });
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">${escapeXml(
      "Configuration error. Goodbye."
    )}</Say><Hangup/></Response>`;
    return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }

  console.log("[ai-voice] routing decision", {
    callSid,
    decision: "dial_handoff",
    intent: route.intent,
    target: route.dialE164.slice(0, 6) + "…",
  });

  const closing =
    intent === "referral"
      ? "Thanks — connecting you with our team now."
      : intent === "urgent_medical"
        ? "Please hold — connecting you right away."
        : "Please hold while we connect you.";

  const twiml = await buildVoiceHandoffTwiml({
    closing,
    publicBase,
    callerId,
    ringE164: route.dialE164,
  });

  if (!twiml) {
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`,
      { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } }
    );
  }

  return new NextResponse(twiml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
}
