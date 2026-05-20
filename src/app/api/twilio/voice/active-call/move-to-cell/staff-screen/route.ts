import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { mergeMoveToCellMetadata } from "@/lib/phone/move-to-cell-metadata";
import { verifyMoveToCellToken } from "@/lib/phone/move-to-cell-token";
import { parseVerifiedTwilioFormBody } from "@/lib/twilio/verify-form-post";

const LOG_TAG = "move-to-cell";

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * TwiML on staff cell after answer: press 1 to join the live conference (voicemail cannot join customer).
 */
export async function POST(req: NextRequest) {
  const parsed = await parseVerifiedTwilioFormBody(req);
  if (!parsed.ok) {
    return parsed.response;
  }

  const token = req.nextUrl.searchParams.get("token");
  const payload = verifyMoveToCellToken(token);
  if (!payload) {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">${escapeXml(
      "This call could not be connected."
    )}</Say><Hangup/></Response>`;
    return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }

  const callSid = parsed.params.CallSid?.trim() ?? null;
  if (callSid?.startsWith("CA")) {
    await mergeMoveToCellMetadata(supabaseAdmin, payload.client_call_sid, {
      status: "press_1",
      cell_call_sid: callSid,
    });
  }

  const publicBase = process.env.TWILIO_PUBLIC_BASE_URL?.trim().replace(/\/$/, "") || "";
  const confirmUrl = `${publicBase}/api/twilio/voice/active-call/move-to-cell/confirm?token=${encodeURIComponent(token ?? "")}`;

  console.log(
    JSON.stringify({
      tag: LOG_TAG,
      event: "staff_screen_started",
      client_call_sid: payload.client_call_sid,
      cell_call_sid: callSid,
    })
  );

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="dtmf" numDigits="1" timeout="8" action="${escapeXml(confirmUrl)}" method="POST">
    <Say voice="Polly.Joanna">${escapeXml(
      "Saintly Home Health. Press 1 to move this call to your cell and improve audio."
    )}</Say>
  </Gather>
  <Say voice="Polly.Joanna">${escapeXml("Goodbye.")}</Say>
  <Hangup/>
</Response>`.trim();

  return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
}
