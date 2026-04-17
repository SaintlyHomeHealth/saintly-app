import { NextRequest, NextResponse } from "next/server";

import { handleInboundDialCascadePost, loadVoiceRoutingJsonV1ByExternalCallId } from "@/lib/phone/twilio-inbound-dial-cascade";
import {
  buildInboundPstnOnlyDialTwiml,
  readTwilioVoiceRingE164FromEnv,
  resolveInboundPstnFallbackCallerId,
} from "@/lib/phone/twilio-voice-handoff";
import { buildSaintlyVoicemailRecordTwiml, resolveTwilioVoicePublicBase } from "@/lib/phone/twilio-voicemail-twiml";
import { parseVerifiedTwilioFormBody } from "@/lib/twilio/verify-form-post";

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * After inbound &lt;Dial&gt; to browser &lt;Client&gt; legs: if not bridged, optionally ring
 * `TWILIO_VOICE_RING_E164`, then Saintly voicemail.
 */
export async function POST(req: NextRequest) {
  const parsed = await parseVerifiedTwilioFormBody(req);
  if (!parsed.ok) {
    return parsed.response;
  }

  const params = parsed.params as Record<string, string | undefined>;
  const dialStatus = (params.DialCallStatus || "").trim().toLowerCase();

  console.log(
    JSON.stringify({
      tag: "inbound-browser-fallback-diag",
      DialCallStatus: dialStatus,
      CallSid: params.CallSid,
      From: params.From,
      To: params.To,
      Called: params.Called,
      ParentCallSid: params.ParentCallSid,
      DialCallSid: params.DialCallSid,
    })
  );

  if (dialStatus === "completed") {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
    return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }

  const publicBase = resolveTwilioVoicePublicBase();
  if (!publicBase) {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">${escapeXml(
      "Please try your call again later."
    )}</Say></Response>`;
    return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }

  const parentForRouting = (params.ParentCallSid ?? "").trim() || (params.CallSid ?? "").trim();
  if (parentForRouting && (await loadVoiceRoutingJsonV1ByExternalCallId(parentForRouting))) {
    const xml = await handleInboundDialCascadePost({ params, publicBase });
    return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }

  const callerId = resolveInboundPstnFallbackCallerId(params);
  const ringRaw = readTwilioVoiceRingE164FromEnv();

  const pstnTwiml = buildInboundPstnOnlyDialTwiml({
    publicBase,
    callerId,
    ringE164Raw: ringRaw,
  });

  if (pstnTwiml) {
    console.log(
      JSON.stringify({
        tag: "inbound-browser-fallback-diag",
        outcome: "pstn_fallback_after_browser_no_answer",
        caller_id_for_pstn_leg: callerId.slice(0, 6) + "…",
        ring_env_nonempty: ringRaw.length > 0,
      })
    );
    return new NextResponse(pstnTwiml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }

  console.warn(
    JSON.stringify({
      tag: "inbound-browser-fallback-diag",
      outcome: "voicemail_after_browser_no_pstn_fallback",
      reason: "buildInboundPstnOnlyDialTwiml_null",
    })
  );

  const xml = buildSaintlyVoicemailRecordTwiml(publicBase);
  return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
}
