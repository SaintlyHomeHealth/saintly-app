import { NextRequest, NextResponse } from "next/server";

import { buildTwiMLAppIncomingClientRingTwiml } from "@/lib/phone/twilio-voice-handoff";
import { isTwilioVoiceJsClientFrom, isTwilioVoiceJsClientTo } from "@/lib/twilio/twilio-voice-client-leg";
import { logTwilioVoiceTrace, summarizeTwimlResponse } from "@/lib/twilio/twilio-voice-trace-log";
import { parseVerifiedTwilioFormBody } from "@/lib/twilio/verify-form-post";

/**
 * Legacy URL: if Twilio still points Voice webhooks here, PSTN inbound redirects to
 * {@link ../inbound-ring/route.ts} (normal ring — no Gather / OpenAI).
 */

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function resolvePublicBase(req: NextRequest): string {
  return (
    process.env.TWILIO_PUBLIC_BASE_URL?.trim().replace(/\/$/, "") ||
    process.env.TWILIO_WEBHOOK_BASE_URL?.trim().replace(/\/$/, "") ||
    new URL(req.url).origin
  );
}

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

  const publicBase = resolvePublicBase(req);

  if (isTwilioVoiceJsClientFrom(from)) {
    if (!publicBase) {
      const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">${escapeXml(
        "Our phone system URL is not configured. Please try again later."
      )}</Say></Response>`;
      logTwilioVoiceTrace({
        route: "POST /api/twilio/voice/ai-answer",
        client_call_sid: callSid,
        pstn_call_sid: null,
        ai_path_entered: false,
        softphone_bypass_path_entered: true,
        twiml_summary: summarizeTwimlResponse(xml),
        branch: "client_from_missing_public_base",
        parent_call_sid: parentCallSid,
        from_raw: from,
        to_raw: to,
      });
      return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
    }
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
      branch: "say_missing_public_base_legacy_ai_answer",
      parent_call_sid: parentCallSid,
      from_raw: from,
      to_raw: to,
    });
    return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }

  const inboundRingUrl = `${publicBase}/api/twilio/voice/inbound-ring`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Redirect method="POST">${escapeXml(
    inboundRingUrl
  )}</Redirect></Response>`;
  console.warn("[twilio/voice/ai-answer] legacy_url_redirect_to_inbound_ring", {
    callSid: callSid.length > 12 ? `${callSid.slice(0, 12)}…` : callSid,
  });
  logTwilioVoiceTrace({
    route: "POST /api/twilio/voice/ai-answer",
    client_call_sid: callSid,
    pstn_call_sid: null,
    ai_path_entered: false,
    softphone_bypass_path_entered: false,
    twiml_summary: summarizeTwimlResponse(xml),
    branch: "legacy_redirect_inbound_ring_no_gather",
    parent_call_sid: parentCallSid,
    from_raw: from,
    to_raw: to,
  });
  return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
}
