import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { applyInboundTwilioSms } from "@/lib/phone/inbound-sms-webhook";
import { parseVerifiedTwilioFormBody } from "@/lib/twilio/verify-form-post";

/**
 * Twilio Messaging inbound webhook. Configure in Twilio Console → Messaging → inbound handler.
 * Does not use Twilio Voice routes.
 */
export async function POST(req: NextRequest) {
  const parsed = await parseVerifiedTwilioFormBody(req);
  if (!parsed.ok) {
    return parsed.response;
  }

  const result = await applyInboundTwilioSms(supabaseAdmin, parsed.params);
  if (!result.ok) {
    console.warn("[api/twilio/sms/inbound]", result.error);
  }

  return new NextResponse(null, { status: 200 });
}
