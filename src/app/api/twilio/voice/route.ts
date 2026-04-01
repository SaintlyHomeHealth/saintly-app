import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { shouldUseAiReceptionistInbound } from "@/lib/phone/ai-receptionist-gate";
import { ensureIncomingCallAlert } from "@/lib/phone/incoming-call-alerts";
import { upsertPhoneCallFromWebhook } from "@/lib/phone/log-call";
import {
  resolveBrowserFirstRingTimeoutSeconds,
  resolveInboundBrowserStaffUserIdsAsync,
} from "@/lib/softphone/inbound-staff-ids";
import { softphoneTwilioClientIdentity } from "@/lib/softphone/twilio-client-identity";
import { getTwilioWebhookSignatureUrl } from "@/lib/twilio/signature-url";
import { validateTwilioWebhookSignature } from "@/lib/twilio/validate-signature";

function formDataToStringRecord(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string") {
      out[key] = value;
    }
  }
  return out;
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Seconds before Twilio stops ringing the forward leg (no-answer → Saintly voicemail). */
const DEFAULT_TWILIO_VOICE_RING_TIMEOUT_SECONDS = 22;
const MIN_TWILIO_VOICE_RING_TIMEOUT_SECONDS = 10;
const MAX_TWILIO_VOICE_RING_TIMEOUT_SECONDS = 45;

function resolveDialTimeoutSeconds(): number {
  const raw = process.env.TWILIO_VOICE_RING_TIMEOUT_SECONDS?.trim();
  if (!raw || !/^\d+$/.test(raw)) {
    return DEFAULT_TWILIO_VOICE_RING_TIMEOUT_SECONDS;
  }
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n)) return DEFAULT_TWILIO_VOICE_RING_TIMEOUT_SECONDS;
  return Math.min(
    MAX_TWILIO_VOICE_RING_TIMEOUT_SECONDS,
    Math.max(MIN_TWILIO_VOICE_RING_TIMEOUT_SECONDS, n)
  );
}

const SAY_TEXT =
  "Thank you for calling Saintly Home Health. Please hold while we connect you.";

const NOT_CONFIGURED =
  "We are sorry, our phone system is not fully configured.";

export async function POST(req: NextRequest) {
  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return new NextResponse("Bad Request", { status: 400 });
  }

  const params = formDataToStringRecord(formData);

  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const signature = req.headers.get("X-Twilio-Signature") ?? req.headers.get("x-twilio-signature");

  if (process.env.NODE_ENV === "production") {
    if (!authToken) {
      return new NextResponse("Service unavailable", { status: 503 });
    }
    const url = getTwilioWebhookSignatureUrl(req);
    if (!validateTwilioWebhookSignature(authToken, signature, url, params)) {
      return new NextResponse("Forbidden", { status: 403 });
    }
  } else if (authToken) {
    const url = getTwilioWebhookSignatureUrl(req);
    if (!validateTwilioWebhookSignature(authToken, signature, url, params)) {
      return new NextResponse("Forbidden", { status: 403 });
    }
  }

  const callSid = params.CallSid?.trim();
  const from = params.From?.trim();
  const to = params.To?.trim();

  if (!callSid || !from || !to) {
    return new NextResponse(
      `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">We are sorry, this call could not be connected.</Say></Response>`,
      { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } }
    );
  }

  const logResult = await upsertPhoneCallFromWebhook(supabaseAdmin, {
    external_call_id: callSid,
    direction: "inbound",
    from_e164: from,
    to_e164: to,
    status: "initiated",
    event_type: "call.incoming",
    started_at: new Date().toISOString(),
    metadata: { source: "twilio_voice_inbound" },
  });

  if (!logResult.ok) {
    console.error("[twilio/voice] phone log failed:", logResult.error);
  } else {
    const alertResult = await ensureIncomingCallAlert(supabaseAdmin, {
      phone_call_id: logResult.callId,
      external_call_id: callSid,
      from_e164: from,
      to_e164: to,
    });
    if (!alertResult.ok) {
      console.error("[twilio/voice] incoming_call_alerts:", alertResult.error);
    }
  }

  /** Narrow live AI path: opt-in via env + allowlist; same phone_call row as above. */
  const publicBaseForAi =
    process.env.TWILIO_PUBLIC_BASE_URL?.trim().replace(/\/$/, "") ||
    process.env.TWILIO_WEBHOOK_BASE_URL?.trim().replace(/\/$/, "") ||
    "";
  if (publicBaseForAi && shouldUseAiReceptionistInbound(from)) {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Redirect method="POST">${escapeXml(
      `${publicBaseForAi}/api/twilio/voice/ai-receptionist/step`
    )}</Redirect></Response>`;
    return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }

  const ringE164 = process.env.TWILIO_VOICE_RING_E164?.trim() ?? "";
  if (!ringE164) {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">${escapeXml(
      NOT_CONFIGURED
    )}</Say></Response>`;
    return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }

  const dialTimeoutSec = resolveDialTimeoutSeconds();

  const callerId = to;
  /** Match webhook/callback base: some envs set TWILIO_WEBHOOK_BASE_URL but omit TWILIO_PUBLIC_BASE_URL. */
  const publicBase =
    process.env.TWILIO_PUBLIC_BASE_URL?.trim().replace(/\/$/, "") ||
    process.env.TWILIO_WEBHOOK_BASE_URL?.trim().replace(/\/$/, "") ||
    "";
  const statusCallbackUrl = publicBase ? `${publicBase}/api/twilio/voice/status` : "";
  const dialActionUrl = publicBase ? `${publicBase}/api/twilio/voice/dial-result` : "";
  const browserFallbackActionUrl = publicBase
    ? `${publicBase}/api/twilio/voice/inbound-browser-fallback`
    : "";

  const inboundBrowserStaffIds = await resolveInboundBrowserStaffUserIdsAsync();
  const browserRingSec = resolveBrowserFirstRingTimeoutSeconds();

  const clientIdentitiesForLog = inboundBrowserStaffIds.map((id) => softphoneTwilioClientIdentity(id));

  const pstnDialAttrs = publicBase
    ? ` answerOnBridge="true" timeout="${dialTimeoutSec}" callerId="${escapeXml(
        callerId
      )}" action="${escapeXml(
        dialActionUrl
      )}" method="POST" statusCallback="${escapeXml(
        statusCallbackUrl
      )}" statusCallbackMethod="POST" statusCallbackEvent="initiated ringing answered completed"`
    : ` answerOnBridge="true" timeout="${dialTimeoutSec}" callerId="${escapeXml(callerId)}"`;

  /** Enable: classify human vs machine quickly; AnsweredBy is POSTed to Dial statusCallback (not DetectMessageEnd). */
  const numberAmdAttrs = ` machineDetection="Enable"`;

  let xml: string;
  let xmlBranch: "browser-first" | "pstn-fallback";
  if (inboundBrowserStaffIds.length > 0 && browserFallbackActionUrl) {
    xmlBranch = "browser-first";
    const browserDialAttrs = publicBase
      ? ` answerOnBridge="true" timeout="${browserRingSec}" callerId="${escapeXml(
          callerId
        )}" action="${escapeXml(
          browserFallbackActionUrl
        )}" method="POST" statusCallback="${escapeXml(
          statusCallbackUrl
        )}" statusCallbackMethod="POST" statusCallbackEvent="initiated ringing answered completed"`
      : ` answerOnBridge="true" timeout="${browserRingSec}" callerId="${escapeXml(callerId)}"`;

    /** Multiple &lt;Client&gt; in one &lt;Dial&gt;: simultaneous ring; first to answer wins (Twilio). */
    const clientBodies = inboundBrowserStaffIds
      .map((id) => `<Client>${escapeXml(softphoneTwilioClientIdentity(id))}</Client>`)
      .join("");

    xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${escapeXml(SAY_TEXT)}</Say>
  <Dial${browserDialAttrs}>
    ${clientBodies}
  </Dial>
</Response>`.trim();
  } else {
    xmlBranch = "pstn-fallback";
    xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${escapeXml(SAY_TEXT)}</Say>
  <Dial${pstnDialAttrs}>
    <Number${numberAmdAttrs}>${escapeXml(ringE164)}</Number>
  </Dial>
</Response>`.trim();
  }

  const browserFirstXml = xmlBranch === "browser-first";
  console.log("[twilio/voice][debug]", {
    inboundBrowserStaffIds,
    inboundClientCount: inboundBrowserStaffIds.length,
    clientIdentitiesFromStaffIds: clientIdentitiesForLog,
    dialMode: "simultaneous_clients_first_answer_wins",
    browserFirstXml,
    xmlBranch,
  });

  return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
}
