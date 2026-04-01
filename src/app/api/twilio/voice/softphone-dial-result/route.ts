import { NextRequest, NextResponse } from "next/server";

import { parseVerifiedTwilioFormBody } from "@/lib/twilio/verify-form-post";

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const NO_ANSWER =
  "We could not connect your call. You can try again in a moment.";

/**
 * Twilio &lt;Dial action&gt; for browser softphone outbound only.
 * Unlike {@link ../dial-result/route.ts}, does not send callers to company voicemail.
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

  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">${escapeXml(
    NO_ANSWER
  )}</Say></Response>`;
  return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
}
