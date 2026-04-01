import { NextRequest, NextResponse } from "next/server";

import { parseVerifiedTwilioFormBody } from "@/lib/twilio/verify-form-post";

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Match {@link ../dial-result/route.ts} — company voicemail after staff leg. */
const VOICEMAIL_PROMPT =
  "We're sorry we missed your call. Please leave your name, number, and reason for calling after the tone.";

/**
 * After inbound &lt;Dial&gt; to browser &lt;Client&gt; legs: if not bridged, go to Saintly-controlled voicemail.
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

  const publicBase =
    process.env.TWILIO_PUBLIC_BASE_URL?.trim().replace(/\/$/, "") ||
    process.env.TWILIO_WEBHOOK_BASE_URL?.trim().replace(/\/$/, "") ||
    "";

  if (!publicBase) {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">${escapeXml(
      "Please try your call again later."
    )}</Say></Response>`;
    return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }

  const recordingCallback = `${publicBase}/api/twilio/voice/recording`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${escapeXml(VOICEMAIL_PROMPT)}</Say>
  <Record
    maxLength="180"
    playBeep="true"
    transcribe="false"
    recordingStatusCallback="${escapeXml(recordingCallback)}"
    recordingStatusCallbackMethod="POST"
  />
  <Say voice="Polly.Joanna">${escapeXml("Thank you for calling Saintly Home Health. Goodbye.")}</Say>
</Response>`.trim();

  return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
}
