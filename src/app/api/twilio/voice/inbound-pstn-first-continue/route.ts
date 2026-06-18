import { NextRequest, NextResponse } from "next/server";

import {
  clientDialNounXml,
  resolveInboundCallerIdForClientDial,
} from "@/lib/phone/twilio-voice-handoff";
import { inferTwilioDialAnswerPath, logInboundVoiceDebug } from "@/lib/phone/twilio-voice-debug";
import { isTwilioDialLegBridged } from "@/lib/phone/twilio-dial-leg-bridge";
import { buildSaintlyVoicemailRecordTwiml, resolveTwilioVoicePublicBase } from "@/lib/phone/twilio-voicemail-twiml";
import { resolveInboundBrowserStaffUserIdsAsync, resolveBrowserFirstRingTimeoutSeconds } from "@/lib/softphone/inbound-staff-ids";
import { softphoneTwilioClientIdentity } from "@/lib/softphone/twilio-client-identity";
import { parseVerifiedTwilioFormBody } from "@/lib/twilio/verify-form-post";

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * After the first PSTN leg (`TWILIO_VOICE_RING_E164`) times out on non-escalation inbound:
 * optionally ring Voice.js clients, then voicemail — does not re-dial the same PSTN leg.
 */
export async function POST(req: NextRequest) {
  const parsed = await parseVerifiedTwilioFormBody(req);
  if (!parsed.ok) {
    return parsed.response;
  }

  const params = parsed.params as Record<string, string | undefined>;
  const dialStatus = (params.DialCallStatus || "").trim().toLowerCase();

  if (isTwilioDialLegBridged(params)) {
    const to = (params.To ?? "").trim();
    logInboundVoiceDebug("dial_leg_completed", {
      handler: "inbound-pstn-first-continue",
      answered_via: inferTwilioDialAnswerPath(to),
    });
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
    return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }

  console.log(
    JSON.stringify({
      tag: "inbound-voice-flow",
      event: "pstn_first_leg_no_answer",
      handler: "inbound-pstn-first-continue",
      dial_call_status: dialStatus,
      call_sid: params.CallSid ?? null,
    })
  );

  const publicBase = resolveTwilioVoicePublicBase(new URL(req.url).origin);
  if (!publicBase) {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">${escapeXml(
      "Please try your call again later."
    )}</Say></Response>`;
    return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }

  const inboundBrowserStaffIds = await resolveInboundBrowserStaffUserIdsAsync();
  if (inboundBrowserStaffIds.length === 0) {
    const vm = buildSaintlyVoicemailRecordTwiml(publicBase, { greeting: "business_hours" });
    return new NextResponse(vm, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }

  const callerId = resolveInboundCallerIdForClientDial(
    (params.From ?? "").trim(),
    (params.To ?? "").trim()
  );
  const base = publicBase.replace(/\/$/, "");
  const dialResultUrl = `${base}/api/twilio/voice/dial-result`;
  const statusCallbackUrl = `${base}/api/twilio/voice/status`;
  const browserRingSec = resolveBrowserFirstRingTimeoutSeconds();

  const browserDialAttrs = ` answerOnBridge="true" timeout="${browserRingSec}" callerId="${escapeXml(
    callerId
  )}" action="${escapeXml(dialResultUrl)}" method="POST" statusCallback="${escapeXml(
    statusCallbackUrl
  )}" statusCallbackMethod="POST" statusCallbackEvent="initiated ringing answered completed"`;

  const clientBodies = inboundBrowserStaffIds
    .map((id) => clientDialNounXml(softphoneTwilioClientIdentity(id), callerId))
    .join("");

  console.log(
    JSON.stringify({
      tag: "inbound-voice-flow",
      event: "browser_ring_after_pstn_first_timeout",
      client_leg_count: inboundBrowserStaffIds.length,
      dial_timeout_sec: browserRingSec,
    })
  );

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial${browserDialAttrs}>
    ${clientBodies}
  </Dial>
</Response>`.trim();

  return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
}
