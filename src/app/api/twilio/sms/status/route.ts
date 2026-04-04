import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { applyTwilioOutboundMessageStatus } from "@/lib/phone/apply-twilio-outbound-message-status";
import { parseVerifiedTwilioFormBody } from "@/lib/twilio/verify-form-post";

/**
 * Twilio Messaging status callback: delivery updates for outbound SMS (queued → sent → delivered, etc.).
 *
 * Configure by setting `StatusCallback` on outbound API sends (see `send-sms.ts`), or in Twilio Console
 * under the Messaging Service / phone number if you prefer console-only configuration.
 */
export async function POST(req: NextRequest) {
  console.log("[sms-status] POST /api/twilio/sms/status");
  const parsed = await parseVerifiedTwilioFormBody(req);
  if (!parsed.ok) {
    return parsed.response;
  }

  const result = await applyTwilioOutboundMessageStatus(supabaseAdmin, parsed.params);
  if (!result.ok) {
    console.warn("[sms-status] apply:", result.error);
  }

  return new NextResponse(null, { status: 200 });
}
