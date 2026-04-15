import { NextRequest, NextResponse } from "next/server";

import { buildInboundPstnOnlyDialTwiml, readTwilioVoiceRingE164FromEnv } from "@/lib/phone/twilio-voice-handoff";
import { buildSaintlyVoicemailRecordTwiml, resolveTwilioVoicePublicBase } from "@/lib/phone/twilio-voicemail-twiml";
import { normalizeDialInputToE164 } from "@/lib/softphone/phone-number";
import { parseVerifiedTwilioFormBody } from "@/lib/twilio/verify-form-post";

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Caller ID shown on the PSTN fallback leg (should be your Twilio DID, not the external caller).
 */
function resolveInboundPstnFallbackCallerId(params: Record<string, string | undefined>): string {
  const fromEnv = normalizeDialInputToE164(process.env.TWILIO_SOFTPHONE_CALLER_ID_E164?.trim() ?? "");
  if (fromEnv) return fromEnv;
  const called = (params.Called ?? "").trim();
  const nCalled = normalizeDialInputToE164(called);
  if (nCalled) return nCalled;
  const to = (params.To ?? "").trim();
  if (to && !to.toLowerCase().startsWith("client:")) {
    const nTo = normalizeDialInputToE164(to);
    if (nTo) return nTo;
  }
  return called || to || (params.From ?? "").trim() || "";
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
