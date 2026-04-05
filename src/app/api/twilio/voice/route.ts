import { NextRequest, NextResponse } from "next/server";

import { parseVerifiedTwilioFormBody } from "@/lib/twilio/verify-form-post";

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function resolveVoicePublicBase(req: NextRequest): string {
  return (
    process.env.TWILIO_PUBLIC_BASE_URL?.trim().replace(/\/$/, "") ||
    process.env.TWILIO_WEBHOOK_BASE_URL?.trim().replace(/\/$/, "") ||
    new URL(req.url).origin
  );
}

/**
 * Main Twilio Voice webhook entrypoint.
 * Validates Twilio signature, then redirects to {@link ../realtime/route.ts} on the **same** deployment
 * (env base or request origin). Never hardcode a production URL — that would upsert phone_calls in prod
 * while staff use staging/other DB on the Calls page.
 */
export async function POST(req: NextRequest) {
  const parsed = await parseVerifiedTwilioFormBody(req);
  if (!parsed.ok) {
    return parsed.response;
  }

  const publicBase = resolveVoicePublicBase(req);
  const realtimeUrl = `${publicBase}/api/twilio/voice/realtime`;
  console.log("[parent-call]", {
    event: "voice_entry_redirect",
    redirect_to: realtimeUrl,
    public_base_source: process.env.TWILIO_PUBLIC_BASE_URL
      ? "TWILIO_PUBLIC_BASE_URL"
      : process.env.TWILIO_WEBHOOK_BASE_URL
        ? "TWILIO_WEBHOOK_BASE_URL"
        : "request_origin",
  });

  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Redirect method="POST">${escapeXml(
    realtimeUrl
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
