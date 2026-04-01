import { NextRequest, NextResponse } from "next/server";

import { parseVerifiedTwilioFormBody } from "@/lib/twilio/verify-form-post";

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const VOICEMAIL_PROMPT =
  "We're sorry we missed your call. Please leave your name, number, and reason for calling after the tone.";

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

  const publicBase = process.env.TWILIO_PUBLIC_BASE_URL?.trim().replace(/\/$/, "");
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
