import { NextRequest, NextResponse } from "next/server";

import { parseVerifiedTwilioFormBody } from "@/lib/twilio/verify-form-post";

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function resolvePublicBase(req: NextRequest): string {
  const configured =
    process.env.TWILIO_PUBLIC_BASE_URL?.trim().replace(/\/$/, "") ||
    process.env.TWILIO_WEBHOOK_BASE_URL?.trim().replace(/\/$/, "");
  if (configured) return configured;
  return req.nextUrl.origin.replace(/\/$/, "");
}

/**
 * Main Twilio Voice webhook entrypoint.
 *
 * Keeps signature validation at this endpoint, then hands off to the current
 * production voice flow route (`/api/twilio/voice/realtime`) which already
 * handles realtime gating + fallback to AI-answer/voice handoff behavior.
 */
export async function POST(req: NextRequest) {
  const parsed = await parseVerifiedTwilioFormBody(req);
  if (!parsed.ok) {
    return parsed.response;
  }

  const publicBase = resolvePublicBase(req);
  const target = `${publicBase}/api/twilio/voice/realtime`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Redirect method="POST">${escapeXml(
    target
  )}</Redirect></Response>`;
  return new NextResponse(xml, {
    status: 200,
    headers: { "Content-Type": "text/xml; charset=utf-8" },
  });
}

export function GET() {
  return new NextResponse("OK", { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
