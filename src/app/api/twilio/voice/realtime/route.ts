import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { ensureIncomingCallAlert } from "@/lib/phone/incoming-call-alerts";
import { upsertPhoneCallFromWebhook } from "@/lib/phone/log-call";
import { buildRealtimeConnectStreamTwiml } from "@/lib/phone/twilio-realtime-stream-twiml";
import {
  resolveTwilioRealtimeMediaStreamWssUrl,
  shouldUseTwilioVoiceRealtimeInbound,
} from "@/lib/phone/twilio-voice-realtime-gate";
import { parseVerifiedTwilioFormBody } from "@/lib/twilio/verify-form-post";

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

/**
 * OpenAI Realtime entry: returns TwiML that connects a bidirectional Media Stream to your bridge WSS URL.
 * Fallback: Redirect to Gather-based {@link ../ai-answer/route.ts} when disabled, ungated, or missing stream URL.
 *
 * Twilio Console: optional Voice webhook POST to `{PUBLIC_BASE}/api/twilio/voice/realtime`
 * (does not replace `/api/twilio/voice` unless you configure it that way).
 */
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
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">We are sorry, this call could not be connected.</Say></Response>`;
    return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }

  const logResult = await upsertPhoneCallFromWebhook(supabaseAdmin, {
    external_call_id: callSid,
    direction: "inbound",
    from_e164: from,
    to_e164: to,
    status: "initiated",
    event_type: "call.incoming",
    started_at: new Date().toISOString(),
    metadata: { source: "twilio_voice_openai_realtime" },
  });

  if (!logResult.ok) {
    console.error("[twilio/voice/realtime] phone log failed:", logResult.error);
  } else {
    const alertResult = await ensureIncomingCallAlert(supabaseAdmin, {
      phone_call_id: logResult.callId,
      external_call_id: callSid,
      from_e164: from,
      to_e164: to,
    });
    if (!alertResult.ok) {
      console.error("[twilio/voice/realtime] incoming_call_alerts:", alertResult.error);
    }
  }

  const publicBase = resolvePublicBase();
  const streamWss = resolveTwilioRealtimeMediaStreamWssUrl();
  const useRealtime =
    Boolean(streamWss) && shouldUseTwilioVoiceRealtimeInbound(from);

  if (useRealtime) {
    const statusCallbackUrl = publicBase ? `${publicBase}/api/twilio/voice/status` : "";
    const twiml = buildRealtimeConnectStreamTwiml({
      streamWssUrl: streamWss,
      statusCallbackUrl: statusCallbackUrl || undefined,
    });
    console.log("[twilio/voice/realtime] connect stream", { callSid: callSid.slice(0, 12) + "…" });
    return new NextResponse(twiml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }

  if (!publicBase) {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">${escapeXml(
      "Our phone system URL is not configured. Please try again later."
    )}</Say></Response>`;
    return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }

  console.log("[twilio/voice/realtime] fallback redirect → ai-answer", { callSid: callSid.slice(0, 12) + "…" });
  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Redirect method="POST">${escapeXml(
    `${publicBase}/api/twilio/voice/ai-answer`
  )}</Redirect></Response>`;
  return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
}
