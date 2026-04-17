import { NextRequest, NextResponse } from "next/server";

import { inferTwilioDialAnswerPath, logInboundVoiceDebug } from "@/lib/phone/twilio-voice-debug";
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
 * Twilio <Dial action> target. If the ring leg completed (someone answered and was connected), returns empty TwiML.
 * Otherwise (no-answer, busy, failed, canceled, etc.) offers Saintly voicemail (Record → /api/twilio/voice/recording).
 */
export async function POST(req: NextRequest) {
  const parsed = await parseVerifiedTwilioFormBody(req);
  if (!parsed.ok) {
    return parsed.response;
  }

  const params = parsed.params;
  const dialStatus = (params.DialCallStatus || "").trim().toLowerCase();
  const to = (params.To ?? "").trim();
  logInboundVoiceDebug("dial_result_callback", {
    dial_call_status: dialStatus,
    answered_via: dialStatus === "completed" ? inferTwilioDialAnswerPath(to) : "n_a",
    handler: "dial-result",
    to_param_tail: to.toLowerCase().startsWith("client:")
      ? `client:…${to.slice(-10)}`
      : `…${to.replace(/\D/g, "").slice(-4)}`,
  });

  const publicBase = resolveTwilioVoicePublicBase();
  if (!publicBase) {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">${escapeXml(
      "Please try your call again later."
    )}</Say></Response>`;
    return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }

  /** Twilio: completed = dialed party answered and was connected to the caller. */
  if (dialStatus === "completed") {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
    return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }

  const xml = buildSaintlyVoicemailRecordTwiml(publicBase);
  return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
}
