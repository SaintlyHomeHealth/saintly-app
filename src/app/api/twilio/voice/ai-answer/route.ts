import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { ensureIncomingCallAlert } from "@/lib/phone/incoming-call-alerts";
import { upsertPhoneCallFromWebhook } from "@/lib/phone/log-call";
import { parseVerifiedTwilioFormBody } from "@/lib/twilio/verify-form-post";

/**
 * AI-first inbound entry: speech Gather, then {@link ./gather/route.ts}.
 *
 * In Twilio Console, set this number’s Voice webhook to POST:
 *   {PUBLIC_BASE}/api/twilio/voice/ai-answer
 * (instead of /api/twilio/voice). Status/recording callbacks stay on existing URLs.
 */

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function resolvePublicBase(): string {
  return (
    process.env.TWILIO_PUBLIC_BASE_URL?.trim().replace(/\/$/, "") ||
    process.env.TWILIO_WEBHOOK_BASE_URL?.trim().replace(/\/$/, "") ||
    ""
  );
}

const GATHER_PROMPT =
  "Hi, you’ve reached Saintly Home Health. In a sentence or two, how can we help you today — are you calling about care at home, a referral, or something else?";

export async function POST(req: NextRequest) {
  const parsed = await parseVerifiedTwilioFormBody(req);
  if (!parsed.ok) {
    return parsed.response;
  }

  const params = parsed.params;
  const callSid = params.CallSid?.trim();
  const from = params.From?.trim();
  const to = params.To?.trim();

  if (!callSid || !from || !to) {
    console.log("[ai-voice] received call — missing CallSid/From/To");
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">We are sorry, this call could not be connected.</Say></Response>`,
      { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } }
    );
  }

  console.log("[ai-voice] received call", { callSid, from, to });

  const logResult = await upsertPhoneCallFromWebhook(supabaseAdmin, {
    external_call_id: callSid,
    direction: "inbound",
    from_e164: from,
    to_e164: to,
    status: "initiated",
    event_type: "call.incoming",
    started_at: new Date().toISOString(),
    metadata: { source: "twilio_voice_ai_answer" },
  });

  if (!logResult.ok) {
    console.error("[ai-voice] phone log failed:", logResult.error);
  } else {
    const alertResult = await ensureIncomingCallAlert(supabaseAdmin, {
      phone_call_id: logResult.callId,
      external_call_id: callSid,
      from_e164: from,
      to_e164: to,
    });
    if (!alertResult.ok) {
      console.error("[ai-voice] incoming_call_alerts:", alertResult.error);
    }
  }

  const publicBase = resolvePublicBase();
  if (!publicBase) {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">${escapeXml(
      "Our phone system URL is not configured. Please try again later."
    )}</Say></Response>`;
    return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }

  const gatherAction = `${publicBase}/api/twilio/voice/ai-answer/gather`;
  const voicemailPrompt = `${publicBase}/api/twilio/voice/voicemail-prompt`;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather
    input="speech"
    language="en-US"
    speechTimeout="auto"
    timeout="10"
    action="${escapeXml(gatherAction)}"
    method="POST"
  >
    <Say voice="Polly.Joanna">${escapeXml(GATHER_PROMPT)}</Say>
  </Gather>
  <Redirect method="POST">${escapeXml(voicemailPrompt)}</Redirect>
</Response>`.trim();

  return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
}
