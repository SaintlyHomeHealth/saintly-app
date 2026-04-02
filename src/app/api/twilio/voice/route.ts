import { NextRequest, NextResponse } from "next/server";

import { parseVerifiedTwilioFormBody } from "@/lib/twilio/verify-form-post";

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Production realtime entry; Twilio follows this POST redirect after signature check on this route. */
const TWILIO_VOICE_REALTIME_URL =
  "https://www.appsaintlyhomehealth.com/api/twilio/voice/realtime";

/**
 * Main Twilio Voice webhook entrypoint.
 * Validates Twilio signature, then redirects to {@link ../realtime/route.ts}.
 */
export async function POST(req: NextRequest) {
  const parsed = await parseVerifiedTwilioFormBody(req);
  if (!parsed.ok) {
    return parsed.response;
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Redirect method="POST">${escapeXml(
    TWILIO_VOICE_REALTIME_URL
  )}</Redirect></Response>`;
  return new NextResponse(xml, {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

export function GET() {
  return new NextResponse("OK", {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
