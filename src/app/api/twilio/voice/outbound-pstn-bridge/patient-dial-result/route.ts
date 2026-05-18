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

const NO_CONNECT = "We could not reach them. You can try again in a moment.";

/**
 * Twilio &lt;Dial action&gt; after calling patient (post staff press-1).
 */
export async function POST(req: NextRequest) {
  const parsed = await parseVerifiedTwilioFormBody(req);
  if (!parsed.ok) {
    return parsed.response;
  }

  const token = req.nextUrl.searchParams.get("token");
  const payload = verifyOutboundPstnBridgeToken(token);
  const dialStatus = (parsed.params.DialCallStatus || "").trim().toLowerCase();
  const callSid = parsed.params.CallSid?.trim() ?? null;

  if (!payload) {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`;
    return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }

  const phoneCallRow = callSid?.startsWith("CA") ? await findPhoneCallRowByTwilioCallSid(supabaseAdmin, callSid) : null;
  const phoneCallId = phoneCallRow?.id ?? null;

  if (dialStatus === "completed") {
    console.log(
      JSON.stringify({
        tag: LOG_TAG,
        event: "patient_answered_bridged",
        call_sid: callSid,
        phone_call_id: phoneCallId,
        patient_tail: payload.patient.replace(/\D/g, "").slice(-4),
        dial_call_status: dialStatus,
      })
    );
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
    return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }

  console.log(
    JSON.stringify({
      tag: LOG_TAG,
      event: "patient_dial_failed_or_no_answer",
      call_sid: callSid,
      phone_call_id: phoneCallId,
      patient_tail: payload.patient.replace(/\D/g, "").slice(-4),
      dial_call_status: dialStatus || null,
    })
  );

  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">${escapeXml(
    NO_CONNECT
  )}</Say><Hangup/></Response>`;
  return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
}
