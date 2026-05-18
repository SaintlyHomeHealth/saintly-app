import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { findPhoneCallRowByTwilioCallSid } from "@/lib/phone/phone-call-lookup-by-call-sid";
import { verifyOutboundPstnBridgeToken } from "@/lib/phone/outbound-pstn-bridge-token";
import { parseVerifiedTwilioFormBody } from "@/lib/twilio/verify-form-post";

const LOG_TAG = "outbound-pstn-bridge";

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * TwiML on the staff cell leg after answer: press 1 to connect to patient.
 */
export async function POST(req: NextRequest) {
  const parsed = await parseVerifiedTwilioFormBody(req);
  if (!parsed.ok) {
    return parsed.response;
  }

  const token = req.nextUrl.searchParams.get("token");
  const payload = verifyOutboundPstnBridgeToken(token);
  if (!payload) {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">${escapeXml(
      "This call could not be connected."
    )}</Say><Hangup/></Response>`;
    return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }

  const publicBase = process.env.TWILIO_PUBLIC_BASE_URL?.trim().replace(/\/$/, "") || "";
  const confirmUrl = `${publicBase}/api/twilio/voice/outbound-pstn-bridge/confirm?token=${encodeURIComponent(token ?? "")}`;

  const callSid = parsed.params.CallSid?.trim() ?? null;
  const phoneCallRow = callSid?.startsWith("CA") ? await findPhoneCallRowByTwilioCallSid(supabaseAdmin, callSid) : null;

  console.log(
    JSON.stringify({
      tag: LOG_TAG,
      event: "staff_leg_answered_screen_started",
      call_sid: callSid,
      phone_call_id: phoneCallRow?.id ?? null,
      patient_tail: payload.patient.replace(/\D/g, "").slice(-4),
    })
  );

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="dtmf" numDigits="1" timeout="8" action="${escapeXml(confirmUrl)}" method="POST">
    <Say voice="Polly.Joanna">${escapeXml(
      "Saintly Home Health outbound call. Press 1 to connect to the patient."
    )}</Say>
  </Gather>
  <Say voice="Polly.Joanna">${escapeXml("Goodbye.")}</Say>
  <Hangup/>
</Response>`.trim();

  return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
}
