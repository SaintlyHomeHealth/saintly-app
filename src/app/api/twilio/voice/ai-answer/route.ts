import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { ensureIncomingCallAlert } from "@/lib/phone/incoming-call-alerts";
import { upsertPhoneCallFromWebhook } from "@/lib/phone/log-call";
import { buildTwiMLAppIncomingClientRingTwiml } from "@/lib/phone/twilio-voice-handoff";
import { isTwilioVoiceJsClientFrom, isTwilioVoiceJsClientTo } from "@/lib/twilio/twilio-voice-client-leg";
import { logTwilioVoiceTrace, summarizeTwimlResponse } from "@/lib/twilio/twilio-voice-trace-log";
import { parseVerifiedTwilioFormBody } from "@/lib/twilio/verify-form-post";

/**
 * AI-first inbound entry: speech Gather, then {@link ./gather/route.ts}.
 *
 * In Twilio Console, set this number’s Voice webhook to POST:
 *   {PUBLIC_BASE}/api/twilio/voice/ai-answer
 * (instead of /api/twilio/voice). Status/recording callbacks stay on existing URLs.
 */

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

const GATHER_PROMPT =
  "Hi, you’ve reached Saintly Home Health. In a sentence or two, how can we help you today — are you calling about care at home, a referral, or something else?";

export async function POST(req: NextRequest) {
  const parsed = await parseVerifiedTwilioFormBody(req);
  if (!parsed.ok) {
    return parsed.response;
  }

  const params = parsed.params;
  const callSid = params.CallSid?.trim();
  const from = params.From?.trim();
  const to = params.To?.trim();
  const parentCallSid = typeof params.ParentCallSid === "string" ? params.ParentCallSid.trim() : null;

  if (!callSid || !from || !to) {
    console.log("[ai-voice] received call — missing CallSid/From/To");
    const errXml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">We are sorry, this call could not be connected.</Say></Response>`;
    logTwilioVoiceTrace({
      route: "POST /api/twilio/voice/ai-answer",
      client_call_sid: callSid ?? null,
      pstn_call_sid: null,
      ai_path_entered: false,
      softphone_bypass_path_entered: false,
      twiml_summary: summarizeTwimlResponse(errXml),
      branch: "missing_callsid_from_or_to",
      parent_call_sid: parentCallSid,
      from_raw: from,
      to_raw: to,
    });
    return new NextResponse(errXml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }

  const publicBase = resolvePublicBase();
  if (isTwilioVoiceJsClientFrom(from) && publicBase) {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Redirect method="POST">${escapeXml(
      `${publicBase}/api/twilio/voice/softphone`
    )}</Redirect></Response>`;
    logTwilioVoiceTrace({
      route: "POST /api/twilio/voice/ai-answer",
      client_call_sid: callSid,
      pstn_call_sid: null,
      ai_path_entered: false,
      softphone_bypass_path_entered: true,
      twiml_summary: summarizeTwimlResponse(xml),
      branch: "redirect_softphone_client_from",
      parent_call_sid: parentCallSid,
      from_raw: from,
      to_raw: to,
    });
    return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }
  if (isTwilioVoiceJsClientTo(to) && publicBase) {
    const twiml = buildTwiMLAppIncomingClientRingTwiml({
      publicBase,
      toClientUri: to,
      pstnCallerE164: from,
    });
    if (twiml) {
      logTwilioVoiceTrace({
        route: "POST /api/twilio/voice/ai-answer",
        client_call_sid: callSid,
        pstn_call_sid: null,
        ai_path_entered: false,
        softphone_bypass_path_entered: true,
        twiml_summary: summarizeTwimlResponse(twiml),
        branch: "twiml_incoming_client_ring",
        parent_call_sid: parentCallSid,
        from_raw: from,
        to_raw: to,
      });
      return new NextResponse(twiml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
    }
  }

  console.log("[ai-voice] received call", { callSid, from, to });

  const logResult = await upsertPhoneCallFromWebhook(supabaseAdmin, {
    external_call_id: callSid,
    direction: "inbound",
    from_e164: from,
    to_e164: to,
    status: "initiated",
    event_type: "call.incoming",
    started_at: new Date().toISOString(),
    metadata: { source: "twilio_voice_ai_answer" },
  });

  if (!logResult.ok) {
    console.error("[ai-voice] phone log failed:", logResult.error);
  } else {
    const alertResult = await ensureIncomingCallAlert(supabaseAdmin, {
      phone_call_id: logResult.callId,
      external_call_id: callSid,
      from_e164: from,
      to_e164: to,
    });
    if (!alertResult.ok) {
      console.error("[ai-voice] incoming_call_alerts:", alertResult.error);
    }
  }

  if (!publicBase) {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">${escapeXml(
      "Our phone system URL is not configured. Please try again later."
    )}</Say></Response>`;
    logTwilioVoiceTrace({
      route: "POST /api/twilio/voice/ai-answer",
      client_call_sid: callSid,
      pstn_call_sid: null,
      ai_path_entered: false,
      softphone_bypass_path_entered: false,
      twiml_summary: summarizeTwimlResponse(xml),
      branch: "say_missing_public_base_after_ai_answer_upsert",
      parent_call_sid: parentCallSid,
      from_raw: from,
      to_raw: to,
    });
    return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }

  const gatherAction = `${publicBase}/api/twilio/voice/ai-answer/gather`;
  const voicemailPrompt = `${publicBase}/api/twilio/voice/voicemail-prompt`;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather
    input="speech"
    language="en-US"
    speechTimeout="auto"
    timeout="10"
    action="${escapeXml(gatherAction)}"
    method="POST"
  >
    <Say voice="Polly.Joanna">${escapeXml(GATHER_PROMPT)}</Say>
  </Gather>
  <Redirect method="POST">${escapeXml(voicemailPrompt)}</Redirect>
</Response>`.trim();

  logTwilioVoiceTrace({
    route: "POST /api/twilio/voice/ai-answer",
    client_call_sid: callSid,
    pstn_call_sid: null,
    ai_path_entered: true,
    softphone_bypass_path_entered: false,
    twiml_summary: summarizeTwimlResponse(xml),
    branch: "gather_speech_ai_receptionist",
    parent_call_sid: parentCallSid,
    from_raw: from,
    to_raw: to,
  });
  return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
}
