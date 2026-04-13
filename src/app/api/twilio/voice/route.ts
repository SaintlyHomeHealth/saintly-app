import { NextRequest, NextResponse } from "next/server";

import { buildTwiMLAppIncomingClientRingTwiml } from "@/lib/phone/twilio-voice-handoff";
import { isTwilioVoiceJsClientFrom, isTwilioVoiceJsClientTo } from "@/lib/twilio/twilio-voice-client-leg";
import { logTwilioVoiceTrace, summarizeTwimlResponse } from "@/lib/twilio/twilio-voice-trace-log";
import { parseVerifiedTwilioFormBody } from "@/lib/twilio/verify-form-post";

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function resolveVoicePublicBase(req: NextRequest): string {
  return (
    process.env.TWILIO_PUBLIC_BASE_URL?.trim().replace(/\/$/, "") ||
    process.env.TWILIO_WEBHOOK_BASE_URL?.trim().replace(/\/$/, "") ||
    new URL(req.url).origin
  );
}

/**
 * Main Twilio Voice webhook entrypoint.
 * Validates Twilio signature, then redirects to {@link ../realtime/route.ts} on the **same** deployment
 * (env base or request origin). Never hardcode a production URL — that would upsert phone_calls in prod
 * while staff use staging/other DB on the Calls page.
 */
export async function POST(req: NextRequest) {
  const parsed = await parseVerifiedTwilioFormBody(req);
  if (!parsed.ok) {
    return parsed.response;
  }

  const publicBase = resolveVoicePublicBase(req);
  const params = parsed.params;
  const from = typeof params.From === "string" ? params.From.trim() : "";
  const to = typeof params.To === "string" ? params.To.trim() : "";
  const callSid = typeof params.CallSid === "string" ? params.CallSid.trim() : "";
  const parentCallSid = typeof params.ParentCallSid === "string" ? params.ParentCallSid.trim() : null;

  /** Outbound from Twilio Voice.js: From=client:… — must use softphone TwiML, not AI receptionist. */
  if (isTwilioVoiceJsClientFrom(from)) {
    const softphoneUrl = `${publicBase}/api/twilio/voice/softphone`;
    console.log("[parent-call]", {
      event: "voice_entry_redirect_softphone_client_from",
      redirect_to: softphoneUrl,
      public_base_source: process.env.TWILIO_PUBLIC_BASE_URL
        ? "TWILIO_PUBLIC_BASE_URL"
        : process.env.TWILIO_WEBHOOK_BASE_URL
          ? "TWILIO_WEBHOOK_BASE_URL"
          : "request_origin",
    });
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Redirect method="POST">${escapeXml(
      softphoneUrl
    )}</Redirect></Response>`;
    logTwilioVoiceTrace({
      route: "POST /api/twilio/voice",
      client_call_sid: callSid || null,
      pstn_call_sid: null,
      ai_path_entered: false,
      softphone_bypass_path_entered: true,
      twiml_summary: summarizeTwimlResponse(xml),
      branch: "redirect_softphone_client_from",
      parent_call_sid: parentCallSid,
      from_raw: from,
      to_raw: to,
    });
    return new NextResponse(xml, {
      status: 200,
      headers: { "Content-Type": "text/xml; charset=utf-8" },
    });
  }

  /** Incoming to a browser Client identity: To=client:… — connect PSTN to WebRTC without AI. */
  if (isTwilioVoiceJsClientTo(to) && publicBase) {
    const twiml = buildTwiMLAppIncomingClientRingTwiml({
      publicBase,
      toClientUri: to,
      pstnCallerE164: from,
    });
    if (twiml) {
      console.log("[parent-call]", {
        event: "voice_entry_incoming_client_ring_no_ai",
        public_base_source: process.env.TWILIO_PUBLIC_BASE_URL
          ? "TWILIO_PUBLIC_BASE_URL"
          : process.env.TWILIO_WEBHOOK_BASE_URL
            ? "TWILIO_WEBHOOK_BASE_URL"
            : "request_origin",
      });
      logTwilioVoiceTrace({
        route: "POST /api/twilio/voice",
        client_call_sid: callSid || null,
        pstn_call_sid: null,
        ai_path_entered: false,
        softphone_bypass_path_entered: true,
        twiml_summary: summarizeTwimlResponse(twiml),
        branch: "twiml_incoming_client_ring",
        parent_call_sid: parentCallSid,
        from_raw: from,
        to_raw: to,
      });
      return new NextResponse(twiml, {
        status: 200,
        headers: { "Content-Type": "text/xml; charset=utf-8" },
      });
    }
  }

  const realtimeUrl = `${publicBase}/api/twilio/voice/realtime`;
  console.log("[parent-call]", {
    event: "voice_entry_redirect",
    redirect_to: realtimeUrl,
    public_base_source: process.env.TWILIO_PUBLIC_BASE_URL
      ? "TWILIO_PUBLIC_BASE_URL"
      : process.env.TWILIO_WEBHOOK_BASE_URL
        ? "TWILIO_WEBHOOK_BASE_URL"
        : "request_origin",
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Redirect method="POST">${escapeXml(
    realtimeUrl
  )}</Redirect></Response>`;
  logTwilioVoiceTrace({
    route: "POST /api/twilio/voice",
    client_call_sid: callSid || null,
    pstn_call_sid: null,
    ai_path_entered: false,
    softphone_bypass_path_entered: false,
    twiml_summary: summarizeTwimlResponse(xml),
    branch: "redirect_realtime_entry",
    parent_call_sid: parentCallSid,
    from_raw: from,
    to_raw: to,
  });
  return new NextResponse(xml, {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

export function GET() {
  return new NextResponse("OK", {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
