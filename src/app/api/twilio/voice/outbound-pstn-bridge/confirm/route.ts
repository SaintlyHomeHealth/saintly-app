import { NextRequest, NextResponse } from "next/server";

import { resolveOutboundPatientRingSeconds } from "@/lib/phone/outbound-pstn-bridge-config";
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
 * Gather result: digit 1 dials patient with Saintly CLI; else hang up.
 */
export async function POST(req: NextRequest) {
  const parsed = await parseVerifiedTwilioFormBody(req);
  if (!parsed.ok) {
    return parsed.response;
  }

  const token = req.nextUrl.searchParams.get("token");
  const payload = verifyOutboundPstnBridgeToken(token);
  const digits = (parsed.params.Digits ?? "").trim();
  const callSid = parsed.params.CallSid?.trim() ?? null;

  if (!payload) {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`;
    return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }

  if (digits !== "1") {
    console.log(
      JSON.stringify({
        tag: LOG_TAG,
        event: "staff_confirm_rejected_or_timeout",
        call_sid: callSid,
        digits: digits || null,
      })
    );
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`;
    return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }

  const publicBase = process.env.TWILIO_PUBLIC_BASE_URL?.trim().replace(/\/$/, "") || "";
  const patientTimeout = resolveOutboundPatientRingSeconds();
  const actionUrl = `${publicBase}/api/twilio/voice/outbound-pstn-bridge/patient-dial-result?token=${encodeURIComponent(token ?? "")}`;

  console.log(
    JSON.stringify({
      tag: LOG_TAG,
      event: "staff_accepted_patient_dialing",
      call_sid: callSid,
      patient_tail: payload.patient.replace(/\D/g, "").slice(-4),
      presentation_cli_tail: payload.cli.replace(/\D/g, "").slice(-4),
      patient_ring_sec: patientTimeout,
    })
  );

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial answerOnBridge="true" timeout="${patientTimeout}" callerId="${escapeXml(payload.cli)}" action="${escapeXml(
    actionUrl
  )}" method="POST">
    <Number>${escapeXml(payload.patient)}</Number>
  </Dial>
</Response>`.trim();

  return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
}
