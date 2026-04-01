import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { upsertPhoneCallFromWebhook } from "@/lib/phone/log-call";
import { isValidE164 } from "@/lib/softphone/phone-number";
import { parseStaffUserIdFromTwilioClientFrom } from "@/lib/softphone/twilio-client-identity";
import { parseVerifiedTwilioFormBody } from "@/lib/twilio/verify-form-post";

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const NOT_CONFIGURED =
  "We are sorry, outbound calling is not fully configured. Please contact your administrator.";

const INVALID_NUMBER = "The number you dialed is not valid. Please check and try again.";

export async function POST(req: NextRequest) {
  const parsed = await parseVerifiedTwilioFormBody(req);
  if (!parsed.ok) {
    return parsed.response;
  }

  const params = parsed.params;
  const callSid = params.CallSid?.trim();
  const fromRaw = params.From?.trim();
  const toRaw = params.To?.trim();

  if (!callSid || !fromRaw) {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">${escapeXml(
      "We could not start this call."
    )}</Say></Response>`;
    return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }

  // Outbound PSTN caller ID: Saintly Twilio DID only (`TWILIO_SOFTPHONE_CALLER_ID_E164`). Do not reuse
  // `TWILIO_VOICE_RING_E164` (inbound ring-to number); that is often a staff cell and was wrongly used as fallback.
  const callerId = process.env.TWILIO_SOFTPHONE_CALLER_ID_E164?.trim() || "";

  if (!callerId || !isValidE164(callerId)) {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">${escapeXml(
      NOT_CONFIGURED
    )}</Say></Response>`;
    return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }

  if (!toRaw || !isValidE164(toRaw)) {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">${escapeXml(
      INVALID_NUMBER
    )}</Say></Response>`;
    return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }

  const staffUserId = parseStaffUserIdFromTwilioClientFrom(fromRaw);
  const startedAt = new Date().toISOString();

  const logResult = await upsertPhoneCallFromWebhook(supabaseAdmin, {
    external_call_id: callSid,
    direction: "outbound",
    from_e164: callerId,
    to_e164: toRaw,
    status: "initiated",
    event_type: "softphone.outbound_twiml",
    started_at: startedAt,
    metadata: {
      source: "twilio_voice_softphone",
      twilio_client_from: fromRaw,
      ...(staffUserId ? { staff_user_id: staffUserId } : {}),
    },
  });

  if (!logResult.ok) {
    console.error("[twilio/voice/softphone] phone log failed:", logResult.error);
  }

  const publicBase = process.env.TWILIO_PUBLIC_BASE_URL?.trim().replace(/\/$/, "");
  const statusCallbackUrl = publicBase ? `${publicBase}/api/twilio/voice/status` : "";
  const dialActionUrl = publicBase ? `${publicBase}/api/twilio/voice/softphone-dial-result` : "";

  const dialAttrs = publicBase
    ? ` answerOnBridge="true" timeout="55" callerId="${escapeXml(
        callerId
      )}" action="${escapeXml(dialActionUrl)}" method="POST" statusCallback="${escapeXml(
        statusCallbackUrl
      )}" statusCallbackMethod="POST" statusCallbackEvent="initiated ringing answered completed"`
    : ` answerOnBridge="true" timeout="55" callerId="${escapeXml(callerId)}"`;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial${dialAttrs}>
    <Number>${escapeXml(toRaw)}</Number>
  </Dial>
</Response>`.trim();

  return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
}
