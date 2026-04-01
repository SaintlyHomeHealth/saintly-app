import {
  resolveBrowserFirstRingTimeoutSeconds,
  resolveInboundBrowserStaffUserIdsAsync,
} from "@/lib/softphone/inbound-staff-ids";
import { softphoneTwilioClientIdentity } from "@/lib/softphone/twilio-client-identity";

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

const DEFAULT_TWILIO_VOICE_RING_TIMEOUT_SECONDS = 22;
const MIN_TWILIO_VOICE_RING_TIMEOUT_SECONDS = 10;
const MAX_TWILIO_VOICE_RING_TIMEOUT_SECONDS = 45;

export function resolvePstnDialTimeoutSeconds(): number {
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

/**
 * Browser-first softphone handoff, then PSTN ring number — same behavior as main inbound voice route.
 */
export async function buildVoiceHandoffTwiml(input: {
  closing: string;
  publicBase: string;
  callerId: string;
  ringE164: string;
}): Promise<string | null> {
  const { closing, publicBase, callerId, ringE164 } = input;
  const inboundBrowserStaffIds = await resolveInboundBrowserStaffUserIdsAsync();
  const browserFallbackActionUrl = publicBase
    ? `${publicBase}/api/twilio/voice/inbound-browser-fallback`
    : "";
  const statusCallbackUrl = publicBase ? `${publicBase}/api/twilio/voice/status` : "";
  const dialActionUrl = publicBase ? `${publicBase}/api/twilio/voice/dial-result` : "";
  const pstnDialSec = resolvePstnDialTimeoutSeconds();
  const browserRingSec = resolveBrowserFirstRingTimeoutSeconds();
  const numberAmdAttrs = ` machineDetection="Enable"`;

  const pstnDialAttrs = publicBase
    ? ` answerOnBridge="true" timeout="${pstnDialSec}" callerId="${escapeXml(
        callerId
      )}" action="${escapeXml(
        dialActionUrl
      )}" method="POST" statusCallback="${escapeXml(
        statusCallbackUrl
      )}" statusCallbackMethod="POST" statusCallbackEvent="initiated ringing answered completed"`
    : ` answerOnBridge="true" timeout="${pstnDialSec}" callerId="${escapeXml(callerId)}"`;

  if (inboundBrowserStaffIds.length > 0 && browserFallbackActionUrl) {
    const browserDialAttrs = publicBase
      ? ` answerOnBridge="true" timeout="${browserRingSec}" callerId="${escapeXml(
          callerId
        )}" action="${escapeXml(
          browserFallbackActionUrl
        )}" method="POST" statusCallback="${escapeXml(
          statusCallbackUrl
        )}" statusCallbackMethod="POST" statusCallbackEvent="initiated ringing answered completed"`
      : ` answerOnBridge="true" timeout="${browserRingSec}" callerId="${escapeXml(callerId)}"`;

    const clientBodies = inboundBrowserStaffIds
      .map((id) => `<Client>${escapeXml(softphoneTwilioClientIdentity(id))}</Client>`)
      .join("");

    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${escapeXml(closing)}</Say>
  <Dial${browserDialAttrs}>
    ${clientBodies}
  </Dial>
</Response>`.trim();
  }

  if (!ringE164) {
    return null;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="Polly.Joanna">${escapeXml(closing)}</Say>
  <Dial${pstnDialAttrs}>
    <Number${numberAmdAttrs}>${escapeXml(ringE164)}</Number>
  </Dial>
</Response>`.trim();
}
