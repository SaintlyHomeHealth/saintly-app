import { NextRequest, NextResponse } from "next/server";

import { resolveTwilioVoicePublicBase } from "@/lib/phone/twilio-voicemail-twiml";
import { parseVerifiedTwilioFormBody } from "@/lib/twilio/verify-form-post";

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const GATHER_TIMEOUT_SEC = 5;

/**
 * Executes on the callee leg after a team &lt;Number&gt; answers: press 1 to bridge to the inbound caller.
 * Without confirmation, personal voicemail can "answer" the business line.
 */
export async function POST(req: NextRequest) {
  const parsed = await parseVerifiedTwilioFormBody(req);
  if (!parsed.ok) {
    return parsed.response;
  }

  const publicBase = resolveTwilioVoicePublicBase();
  if (!publicBase) {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`;
    return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }

  const base = publicBase.replace(/\/$/, "");
  const confirmUrl = `${base}/api/twilio/voice/team-ring-screen/confirm`;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="dtmf" numDigits="1" timeout="${GATHER_TIMEOUT_SEC}" action="${escapeXml(
    confirmUrl
  )}" method="POST">
    <Say voice="Polly.Joanna">${escapeXml(
      "This is a Saintly Home Health business call. Press 1 to accept."
    )}</Say>
  </Gather>
  <Say voice="Polly.Joanna">${escapeXml("Goodbye.")}</Say>
  <Hangup/>
</Response>`.trim();

  return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
}
