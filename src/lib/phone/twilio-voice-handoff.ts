import { normalizePhone } from "@/lib/phone/us-phone-format";
import {
  resolveBrowserFirstRingTimeoutSeconds,
  resolveInboundBrowserStaffUserIdsAsync,
} from "@/lib/softphone/inbound-staff-ids";
import { softphoneTwilioClientIdentity } from "@/lib/softphone/twilio-client-identity";

import { isPstnHandoffAiLoopRisk } from "@/lib/phone/twilio-voice-pstn-loop-guard";

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Twilio requires `<Identity>` inside `<Client>` when using `<Parameter>` (Voice TwiML).
 * `pstn_from` is read by the browser SDK as `call.customParameters` so AI → browser transfers keep PSTN CLI.
 */
function clientDialNounXml(identity: string, pstnCallerIdForDial: string): string {
  const idEsc = escapeXml(identity);
  const pstn = pstnCallerIdForDial.trim();
  const param =
    pstn && normalizePhone(pstn).length >= 10
      ? `<Parameter name="pstn_from" value="${escapeXml(pstn)}" />`
      : "";
  return `<Client><Identity>${idEsc}</Identity>${param}</Client>`;
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

  const openingSay =
    closing.trim().length > 0
      ? `<Say voice="Polly.Joanna">${escapeXml(closing)}</Say>`
      : "";

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
      .map((id) => clientDialNounXml(softphoneTwilioClientIdentity(id), callerId))
      .join("");

    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${openingSay}
  <Dial${browserDialAttrs}>
    ${clientBodies}
  </Dial>
</Response>`.trim();
  }

  if (!ringE164) {
    console.warn("[buildVoiceHandoffTwiml] branch=pstn UNAVAILABLE: no TWILIO_VOICE_RING_E164 and no browser targets");
    return null;
  }

  if (isPstnHandoffAiLoopRisk(ringE164, callerId)) {
    console.warn("[buildVoiceHandoffTwiml] branch=pstn BLOCKED: ring number matches inbound To (AI entry) — would re-enter voice webhook", {
      ringTail: ringE164.replace(/\D/g, "").slice(-4),
      inboundToTail: callerId.replace(/\D/g, "").slice(-4),
      hint: "Set TWILIO_VOICE_INBOUND_STAFF_USER_IDS or staff_profiles.inbound_ring_enabled, or set TWILIO_VOICE_RING_E164 to a human PSTN line (not your Twilio public number).",
    });
    return null;
  }

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${openingSay}
  <Dial${pstnDialAttrs}>
    <Number${numberAmdAttrs}>${escapeXml(ringE164)}</Number>
  </Dial>
</Response>`.trim();
}

/**
 * TwiML Application request whose **To** is `client:…` (incoming ring to a Voice SDK browser).
 * Never use the AI receptionist / OpenAI realtime path — bridge the caller to the WebRTC client.
 */
export function buildTwiMLAppIncomingClientRingTwiml(input: {
  publicBase: string;
  /** Twilio `To`, e.g. `client:saintly_<uuid>`. */
  toClientUri: string;
  /** Twilio `From` — PSTN caller E.164 when present. */
  pstnCallerE164: string;
}): string | null {
  const base = input.publicBase.trim().replace(/\/$/, "");
  const to = input.toClientUri.trim();
  if (!base || !to.toLowerCase().startsWith("client:")) {
    return null;
  }
  const identity = to.slice("client:".length).trim();
  if (!identity) {
    return null;
  }
  const pstn = input.pstnCallerE164.trim();
  const browserFallbackActionUrl = `${base}/api/twilio/voice/inbound-browser-fallback`;
  const statusCallbackUrl = `${base}/api/twilio/voice/status`;
  const browserRingSec = resolveBrowserFirstRingTimeoutSeconds();
  const callerIdForDial = pstn || identity;

  const browserDialAttrs = ` answerOnBridge="true" timeout="${browserRingSec}" callerId="${escapeXml(
    callerIdForDial
  )}" action="${escapeXml(browserFallbackActionUrl)}" method="POST" statusCallback="${escapeXml(
    statusCallbackUrl
  )}" statusCallbackMethod="POST" statusCallbackEvent="initiated ringing answered completed"`;

  const clientBody = clientDialNounXml(identity, pstn);

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial${browserDialAttrs}>
    ${clientBody}
  </Dial>
</Response>`.trim();
}
