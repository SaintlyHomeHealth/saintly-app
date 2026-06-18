import { NextRequest, NextResponse } from "next/server";

import {
  clientDialNounXml,
  resolveInboundCallerIdForClientDial,
} from "@/lib/phone/twilio-voice-handoff";
import { inferTwilioDialAnswerPath, logInboundVoiceDebug } from "@/lib/phone/twilio-voice-debug";
import { isTwilioDialLegBridged } from "@/lib/phone/twilio-dial-leg-bridge";
import { resolveTwilioVoicePublicBase } from "@/lib/phone/twilio-voicemail-twiml";
import { resolveBrowserFirstRingTimeoutSeconds } from "@/lib/softphone/inbound-staff-ids";
import { softphoneTwilioClientIdentity } from "@/lib/softphone/twilio-client-identity";
import { parseVerifiedTwilioFormBody } from "@/lib/twilio/verify-form-post";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * After PSTN ring to `staff_profiles.sms_notify_phone` for a staff-assigned Twilio DID:
 * ring that staff's Voice.js identity; then company `inbound-browser-fallback`.
 */
export async function POST(req: NextRequest) {
  const parsed = await parseVerifiedTwilioFormBody(req);
  if (!parsed.ok) {
    return parsed.response;
  }

  const url = new URL(req.url);
  const staffUserIdRaw = url.searchParams.get("staff_user_id")?.trim() ?? "";
  const staffUserId = staffUserIdRaw.toLowerCase();
  if (!UUID_RE.test(staffUserId)) {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
    return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }

  const params = parsed.params as Record<string, string | undefined>;
  const dialStatus = (params.DialCallStatus || "").trim().toLowerCase();

  if (isTwilioDialLegBridged(params)) {
    const to = (params.To ?? "").trim();
    logInboundVoiceDebug("dial_leg_completed", {
      handler: "inbound-staff-after-pstn",
      answered_via: inferTwilioDialAnswerPath(to),
    });
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
    return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }

  console.log(
    JSON.stringify({
      tag: "inbound-voice-flow",
      event: "staff_did_pstn_leg_no_answer",
      handler: "inbound-staff-after-pstn",
      dial_call_status: dialStatus,
      staff_user_tail: staffUserId.slice(-8),
    })
  );

  const publicBase = resolveTwilioVoicePublicBase(new URL(req.url).origin);
  if (!publicBase) {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">${escapeXml(
      "Please try your call again later."
    )}</Say></Response>`;
    return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }

  const base = publicBase.replace(/\/$/, "");
  const from = (params.From ?? "").trim();
  const to = (params.To ?? "").trim();
  const callerId = resolveInboundCallerIdForClientDial(from, to);
  const browserRingSec = resolveBrowserFirstRingTimeoutSeconds();
  const browserFallbackActionUrl = `${base}/api/twilio/voice/inbound-browser-fallback`;
  const statusCallbackUrl = `${base}/api/twilio/voice/status`;

  const browserDialAttrs = ` answerOnBridge="true" timeout="${browserRingSec}" callerId="${escapeXml(
    callerId
  )}" action="${escapeXml(browserFallbackActionUrl)}" method="POST" statusCallback="${escapeXml(
    statusCallbackUrl
  )}" statusCallbackMethod="POST" statusCallbackEvent="initiated ringing answered completed"`;

  const identity = softphoneTwilioClientIdentity(staffUserId);
  const clientBody = clientDialNounXml(identity, callerId);

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial${browserDialAttrs}>
    ${clientBody}
  </Dial>
</Response>`.trim();

  return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
}
