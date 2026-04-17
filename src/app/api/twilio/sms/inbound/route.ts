import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { applyInboundTwilioSms } from "@/lib/phone/inbound-sms-webhook";
import { parseVerifiedTwilioFormBody } from "@/lib/twilio/verify-form-post";

/**
 * Twilio Messaging inbound webhook. Configure in Twilio Console → Messaging → inbound handler.
 * Does not use Twilio Voice routes.
 */
export async function POST(req: NextRequest) {
  console.log("[sms-inbound] POST /api/twilio/sms/inbound");
  const parsed = await parseVerifiedTwilioFormBody(req);
  if (!parsed.ok) {
    return parsed.response;
  }

  if (process.env.SMS_PUSH_TIMING === "1") {
    const p = parsed.params;
    const messageSid = (p.MessageSid ?? p.SmsSid ?? "").trim();
    console.log("[SMS] webhook_received", Date.now(), {
      route: "/api/twilio/sms/inbound",
      from: p.From,
      to: p.To,
      messageSid: messageSid || "(missing)",
    });
  }

  const result = await applyInboundTwilioSms(supabaseAdmin, parsed.params);
  if (!result.ok) {
    console.warn("[api/twilio/sms/inbound]", result.error);
  }

  return new NextResponse(null, { status: 200 });
}
