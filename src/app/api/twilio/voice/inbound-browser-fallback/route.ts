import { NextRequest, NextResponse } from "next/server";

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
 * After inbound <Dial> to browser <Client> legs: if not bridged, go to Saintly-controlled voicemail.
 * This avoids forwarding to a personal PSTN line/voicemail from browser no-answer.
 */
export async function POST(req: NextRequest) {
  const parsed = await parseVerifiedTwilioFormBody(req);
  if (!parsed.ok) {
    return parsed.response;
  }

  const dialStatus = (parsed.params.DialCallStatus || "").trim().toLowerCase();
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

  const xml = buildSaintlyVoicemailRecordTwiml(publicBase);
  return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
}
