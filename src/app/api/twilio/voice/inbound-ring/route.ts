import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { ensureIncomingCallAlert } from "@/lib/phone/incoming-call-alerts";
import { upsertPhoneCallFromWebhook } from "@/lib/phone/log-call";
import { buildSaintlyVoicemailRecordTwiml } from "@/lib/phone/twilio-voicemail-twiml";
import { phoneKeyForLoopCompare } from "@/lib/phone/twilio-voice-pstn-loop-guard";
import {
  buildTwiMLAppIncomingClientRingTwiml,
  buildVoiceHandoffTwiml,
  readTwilioVoiceRingE164FromEnv,
  resolveInboundCallerIdForClientDial,
} from "@/lib/phone/twilio-voice-handoff";
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

function resolvePublicBase(req: NextRequest): string {
  return (
    process.env.TWILIO_PUBLIC_BASE_URL?.trim().replace(/\/$/, "") ||
    process.env.TWILIO_WEBHOOK_BASE_URL?.trim().replace(/\/$/, "") ||
    new URL(req.url).origin
  );
}

/**
 * PSTN inbound: ring browser staff first (when configured), then `TWILIO_VOICE_RING_E164`.
 * No Gather, no OpenAI, no Media Streams — normal phone behavior.
 */
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
      route: "POST /api/twilio/voice/inbound-ring",
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
        route: "POST /api/twilio/voice/inbound-ring",
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
    const softphoneUrl = `${publicBase}/api/twilio/voice/softphone`;
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Redirect method="POST">${escapeXml(
      softphoneUrl
    )}</Redirect></Response>`;
    logTwilioVoiceTrace({
      route: "POST /api/twilio/voice/inbound-ring",
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
        route: "POST /api/twilio/voice/inbound-ring",
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

  const logResult = await upsertPhoneCallFromWebhook(supabaseAdmin, {
    external_call_id: callSid,
    direction: "inbound",
    from_e164: from,
    to_e164: to,
    status: "initiated",
    event_type: "call.incoming",
    started_at: new Date().toISOString(),
    metadata: { source: "twilio_voice_inbound_ring" },
  });

  if (!logResult.ok) {
    console.error("[twilio/voice/inbound-ring] phone log failed:", logResult.error);
  } else {
    const alertResult = await ensureIncomingCallAlert(supabaseAdmin, {
      phone_call_id: logResult.callId,
      external_call_id: callSid,
      from_e164: from,
      to_e164: to,
    });
    if (!alertResult.ok) {
      console.error("[twilio/voice/inbound-ring] incoming_call_alerts:", alertResult.error);
    }
  }

  if (!publicBase) {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">${escapeXml(
      "Our phone system URL is not configured. Please try again later."
    )}</Say></Response>`;
    logTwilioVoiceTrace({
      route: "POST /api/twilio/voice/inbound-ring",
      client_call_sid: callSid,
      pstn_call_sid: null,
      ai_path_entered: false,
      softphone_bypass_path_entered: false,
      twiml_summary: summarizeTwimlResponse(xml),
      branch: "say_missing_public_base",
      parent_call_sid: parentCallSid,
      from_raw: from,
      to_raw: to,
    });
    return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }

  const ringE164Raw = readTwilioVoiceRingE164FromEnv();
  const callerId = resolveInboundCallerIdForClientDial(from, to);

  console.log(
    JSON.stringify({
      tag: "inbound-ring-diag",
      step: "inbound_ring_route",
      inbound_did_key_tail: phoneKeyForLoopCompare(to)?.slice(-4) ?? null,
      from_key_tail: phoneKeyForLoopCompare(from)?.slice(-4) ?? null,
      call_sid_short: callSid.length > 8 ? `${callSid.slice(0, 6)}…` : callSid,
      twilio_voice_ring_e164_env_set: Boolean(process.env.TWILIO_VOICE_RING_E164?.trim()),
      ring_e164_raw_nonempty: ringE164Raw.length > 0,
    })
  );

  const twiml = await buildVoiceHandoffTwiml({
    closing: "",
    publicBase,
    callerId,
    ringE164: ringE164Raw,
  });

  if (!twiml) {
    console.warn(
      JSON.stringify({
        tag: "inbound-ring-diag",
        step: "inbound_ring_route",
        outcome: "voicemail_fallback",
        reason: "buildVoiceHandoffTwiml_null",
      })
    );
    console.warn("[twilio/voice/inbound-ring] buildVoiceHandoffTwiml returned null — voicemail fallback");
    const vm = buildSaintlyVoicemailRecordTwiml(publicBase);
    logTwilioVoiceTrace({
      route: "POST /api/twilio/voice/inbound-ring",
      client_call_sid: callSid,
      pstn_call_sid: null,
      ai_path_entered: false,
      softphone_bypass_path_entered: false,
      twiml_summary: summarizeTwimlResponse(vm),
      branch: "handoff_unavailable_voicemail_fallback",
      parent_call_sid: parentCallSid,
      from_raw: from,
      to_raw: to,
    });
    return new NextResponse(vm, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }

  logTwilioVoiceTrace({
    route: "POST /api/twilio/voice/inbound-ring",
    client_call_sid: callSid,
    pstn_call_sid: null,
    ai_path_entered: false,
    softphone_bypass_path_entered: false,
    twiml_summary: summarizeTwimlResponse(twiml),
    branch: "direct_ring_no_ai",
    parent_call_sid: parentCallSid,
    from_raw: from,
    to_raw: to,
  });
  return new NextResponse(twiml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
}
