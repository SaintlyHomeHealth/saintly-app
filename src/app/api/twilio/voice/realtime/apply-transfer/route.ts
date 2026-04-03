import { NextRequest, NextResponse } from "next/server";

import twilio from "twilio";

import { buildVoiceHandoffTwiml } from "@/lib/phone/twilio-voice-handoff";

function resolvePublicBase(): string {
  return (
    process.env.TWILIO_PUBLIC_BASE_URL?.trim().replace(/\/$/, "") ||
    process.env.TWILIO_WEBHOOK_BASE_URL?.trim().replace(/\/$/, "") ||
    ""
  );
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function sayDialPstnTwiml(input: { closing: string; numberE164: string; callerId: string }): string {
  const esc = escapeXml;
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${esc(input.closing)}</Say>
  <Dial timeout="30" callerId="${esc(input.callerId)}">
    <Number>${esc(input.numberE164)}</Number>
  </Dial>
</Response>`.trim();
}

const TWIML_HANGUP = `<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`;

const ALLOWED_INTENTS = new Set([
  "patient",
  "referral",
  "vendor",
  "wrong_number",
  "spam",
  "urgent_medical",
]);

/**
 * Bridge-only: after OpenAI `route_call`, redirect the live parent call from Media Streams to
 * browser &lt;Client&gt; ring (via {@link buildVoiceHandoffTwiml}) or PSTN / hangup.
 * Secured with REALTIME_BRIDGE_SHARED_SECRET (same as {@link ../result/route.ts}).
 */
export async function POST(req: NextRequest) {
  const secret = process.env.REALTIME_BRIDGE_SHARED_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }

  const headerSecret = req.headers.get("X-Realtime-Bridge-Secret")?.trim();
  if (headerSecret !== secret) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const o = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : null;
  if (!o) {
    return NextResponse.json({ ok: false, error: "invalid_body" }, { status: 400 });
  }

  const callSid = typeof o.call_sid === "string" ? o.call_sid.trim() : "";
  const intentRaw = typeof o.intent === "string" ? o.intent.trim() : "";
  const callerId = typeof o.caller_id === "string" ? o.caller_id.trim() : "";

  if (!callSid || !callerId || !ALLOWED_INTENTS.has(intentRaw)) {
    return NextResponse.json({ ok: false, error: "missing_or_invalid_fields" }, { status: 400 });
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const ringE164 = process.env.TWILIO_VOICE_RING_E164?.trim();
  const priorityE164 = process.env.TWILIO_VOICE_PRIORITY_E164?.trim() || ringE164;
  const publicBase = resolvePublicBase();

  if (!accountSid || !authToken) {
    return NextResponse.json({ ok: false, error: "twilio_credentials_missing" }, { status: 503 });
  }

  let twiml: string;

  if (intentRaw === "spam" || intentRaw === "wrong_number") {
    twiml = TWIML_HANGUP;
  } else if (intentRaw === "urgent_medical") {
    if (!priorityE164) {
      return NextResponse.json({ ok: false, error: "priority_ring_not_configured" }, { status: 503 });
    }
    twiml = sayDialPstnTwiml({
      closing: "Connecting you right away.",
      numberE164: priorityE164,
      callerId,
    });
  } else {
    if (!publicBase) {
      return NextResponse.json({ ok: false, error: "missing_public_base_url" }, { status: 503 });
    }
    if (!ringE164) {
      return NextResponse.json({ ok: false, error: "ring_e164_not_configured" }, { status: 503 });
    }
    const handoff = await buildVoiceHandoffTwiml({
      closing: "Connecting you to our team now.",
      publicBase,
      callerId,
      ringE164,
    });
    if (!handoff) {
      return NextResponse.json({ ok: false, error: "handoff_twiml_unavailable" }, { status: 503 });
    }
    twiml = handoff;
  }

  try {
    const client = twilio(accountSid, authToken);
    await client.calls(callSid).update({ twiml });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[twilio/voice/realtime/apply-transfer] calls.update failed:", msg);
    return NextResponse.json({ ok: false, error: "twilio_update_failed", detail: msg }, { status: 502 });
  }

  console.log("[twilio/voice/realtime/apply-transfer] ok", {
    callSid: callSid.length > 12 ? `${callSid.slice(0, 12)}…` : callSid,
    intent: intentRaw,
  });

  return NextResponse.json({ ok: true });
}
