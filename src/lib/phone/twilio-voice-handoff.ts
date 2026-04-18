import { normalizePhone } from "@/lib/phone/us-phone-format";
import {
  isWithinBusinessHoursNow,
  isVoiceEscalationPipelineEnabled,
  readEscalationPstnFallbackE164FromEnv,
  resolveEscalationBackupRingTimeoutSeconds,
  resolveEscalationPstnRingTimeoutSeconds,
  resolveEscalationPrimaryRingTimeoutSeconds,
} from "@/lib/phone/voice-escalation-config";
import { isPstnHandoffAiLoopRisk, phoneKeyForLoopCompare } from "@/lib/phone/twilio-voice-pstn-loop-guard";
import {
  resolveBackupInboundStaffUserIdsAsync,
  resolveBrowserFirstRingTimeoutSeconds,
  resolveInboundBrowserStaffUserIdsAsync,
} from "@/lib/softphone/inbound-staff-ids";
import { normalizeDialInputToE164 } from "@/lib/softphone/phone-number";
import { softphoneTwilioClientIdentity } from "@/lib/softphone/twilio-client-identity";
import type { InboundCallerClientDialExtras } from "@/lib/phone/inbound-caller-identity";
import {
  isTwilioVoiceDebugPstnFallbackDisabled,
  logInboundVoiceDebug,
  uuidTail,
} from "@/lib/phone/twilio-voice-debug";

/**
 * Raw PSTN ring target from Vercel/Railway (`TWILIO_VOICE_RING_E164`).
 * If multiple numbers are listed (comma/semicolon), the first non-empty segment is used.
 */
export function readTwilioVoiceRingE164FromEnv(): string {
  const raw = process.env.TWILIO_VOICE_RING_E164?.trim() ?? "";
  if (!raw) return "";
  const first = raw
    .split(/[,;]/)[0]
    ?.trim()
    ?.replace(/^["']|["']$/g, "");
  return first ?? "";
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * PSTN inbound: `From` is the caller, `To` is the Twilio DID. `<Dial callerId>` and `pstn_from`
 * must use the real PSTN caller — not the DID — so the Voice SDK shows the correct CLI.
 */
export function resolveInboundCallerIdForClientDial(from: string, to: string): string {
  const f = from.trim();
  const t = to.trim();
  if (f.toLowerCase().startsWith("client:")) {
    return f || t;
  }
  if (normalizePhone(f).length >= 10) {
    return f;
  }
  return f || t;
}

/**
 * Caller ID for the PSTN fallback leg after browser ring (Twilio DID, not external caller).
 */
export function resolveInboundPstnFallbackCallerId(params: Record<string, string | undefined>): string {
  const fromEnv = normalizeDialInputToE164(process.env.TWILIO_SOFTPHONE_CALLER_ID_E164?.trim() ?? "");
  if (fromEnv) return fromEnv;
  const called = (params.Called ?? "").trim();
  const nCalled = normalizeDialInputToE164(called);
  if (nCalled) return nCalled;
  const to = (params.To ?? "").trim();
  if (to && !to.toLowerCase().startsWith("client:")) {
    const nTo = normalizeDialInputToE164(to);
    if (nTo) return nTo;
  }
  return called || to || (params.From ?? "").trim() || "";
}

function clientDialExtraParamsXml(extras: InboundCallerClientDialExtras | null | undefined): string {
  if (!extras) return "";
  const add = (k: string, v: string | null | undefined): string => {
    const t = (v ?? "").trim();
    if (!t) return "";
    const cap = t.length > 200 ? `${t.slice(0, 200)}…` : t;
    return `<Parameter name="${escapeXml(k)}" value="${escapeXml(cap)}" />`;
  };
  return [
    add("caller_name", extras.caller_name),
    add("caller_name_source", extras.caller_name_source),
    add("lead_id", extras.lead_id),
    add("contact_id", extras.contact_id),
    add("conversation_id", extras.conversation_id),
  ].join("");
}

/**
 * Twilio requires `<Identity>` inside `<Client>` when using `<Parameter>` (Voice TwiML).
 * `pstn_from` is read by the browser SDK as `call.customParameters` so AI → browser transfers keep PSTN CLI.
 */
export function clientDialNounXml(
  identity: string,
  pstnCallerIdForDial: string,
  extras?: InboundCallerClientDialExtras | null
): string {
  const idEsc = escapeXml(identity);
  const pstn = pstnCallerIdForDial.trim();
  const param =
    pstn && normalizePhone(pstn).length >= 10
      ? `<Parameter name="pstn_from" value="${escapeXml(pstn)}" />`
      : "";
  const extra = clientDialExtraParamsXml(extras);
  return `<Client><Identity>${idEsc}</Identity>${param}${extra}</Client>`;
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
 * Inbound-only PSTN leg (no browser). Used by initial `/inbound-ring` PSTN path and by
 * `/inbound-browser-fallback` after browser no-answer.
 */
export function buildInboundPstnOnlyDialTwiml(input: {
  publicBase: string;
  callerId: string;
  ringE164Raw: string;
  dialTimeoutSeconds?: number;
  dialActionUrlOverride?: string;
}): string | null {
  if (isTwilioVoiceDebugPstnFallbackDisabled()) {
    logInboundVoiceDebug("pstn_fallback_suppressed", {
      reason: "TWILIO_VOICE_DEBUG_DISABLE_PSTN_FALLBACK",
      step: "buildInboundPstnOnlyDialTwiml",
    });
    return null;
  }
  const pstnRingNormalized =
    input.ringE164Raw.trim().length > 0 ? normalizeDialInputToE164(input.ringE164Raw.trim()) : null;
  if (!pstnRingNormalized) {
    console.log(
      JSON.stringify({
        tag: "inbound-ring-diag",
        step: "buildInboundPstnOnlyDialTwiml",
        outcome: "null",
        reason: "unparseable_ring",
      })
    );
    return null;
  }
  if (isPstnHandoffAiLoopRisk(pstnRingNormalized, input.callerId)) {
    console.log(
      JSON.stringify({
        tag: "inbound-ring-diag",
        step: "buildInboundPstnOnlyDialTwiml",
        outcome: "null",
        reason: "loop_guard",
      })
    );
    return null;
  }
  return buildPstnNumberDialOpeningResponseXml({
    openingSay: "",
    publicBase: input.publicBase,
    callerId: input.callerId,
    pstnRingNormalized,
    dialTimeoutSeconds: input.dialTimeoutSeconds,
    dialActionUrlOverride: input.dialActionUrlOverride,
  });
}

/**
 * PSTN leg for multi-step inbound cascade (`/inbound-dial-cascade` as &lt;Dial action&gt;).
 */
export function buildInboundPstnCascadeDialTwiml(input: {
  publicBase: string;
  callerId: string;
  pstnRingNormalized: string;
  dialTimeoutSeconds?: number;
}): string | null {
  if (isTwilioVoiceDebugPstnFallbackDisabled()) {
    logInboundVoiceDebug("pstn_fallback_suppressed", {
      reason: "TWILIO_VOICE_DEBUG_DISABLE_PSTN_FALLBACK",
      step: "buildInboundPstnCascadeDialTwiml",
      pstn_ring_key_tail: phoneKeyForLoopCompare(input.pstnRingNormalized)?.slice(-4) ?? null,
    });
    return null;
  }
  if (isPstnHandoffAiLoopRisk(input.pstnRingNormalized, input.callerId)) {
    return null;
  }
  const base = input.publicBase.trim().replace(/\/$/, "");
  const cascadeUrl = base ? `${base}/api/twilio/voice/inbound-dial-cascade` : "";
  return buildPstnNumberDialOpeningResponseXml({
    openingSay: "",
    publicBase: input.publicBase,
    callerId: input.callerId,
    pstnRingNormalized: input.pstnRingNormalized,
    dialTimeoutSeconds: input.dialTimeoutSeconds,
    dialActionUrlOverride: cascadeUrl || undefined,
  });
}

function buildPstnNumberDialOpeningResponseXml(input: {
  openingSay: string;
  publicBase: string;
  callerId: string;
  pstnRingNormalized: string;
  /** When set, overrides env `TWILIO_VOICE_RING_TIMEOUT_SECONDS` resolution. */
  dialTimeoutSeconds?: number;
  /** Full URL for `<Dial action>` (default: `/dial-result`). Use `/inbound-dial-cascade` for multi-step routing. */
  dialActionUrlOverride?: string;
}): string {
  const { openingSay, publicBase, callerId, pstnRingNormalized } = input;
  const statusCallbackUrl = publicBase ? `${publicBase}/api/twilio/voice/status` : "";
  const dialActionUrl =
    input.dialActionUrlOverride?.trim() ||
    (publicBase ? `${publicBase}/api/twilio/voice/dial-result` : "");
  const pstnDialSec = input.dialTimeoutSeconds ?? resolvePstnDialTimeoutSeconds();
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

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${openingSay}
  <Dial${pstnDialAttrs}>
    <Number${numberAmdAttrs}>${escapeXml(pstnRingNormalized)}</Number>
  </Dial>
</Response>`.trim();
}

/**
 * Browser-first softphone handoff, then PSTN ring number — same behavior as main inbound voice route.
 */
export async function buildVoiceHandoffTwiml(input: {
  closing: string;
  publicBase: string;
  callerId: string;
  /** Raw env or UI string; normalized to E.164 before PSTN dial. */
  ringE164: string;
  clientDialExtras?: InboundCallerClientDialExtras | null;
}): Promise<string | null> {
  const { closing, publicBase, callerId, ringE164, clientDialExtras } = input;
  const inboundBrowserStaffIds = await resolveInboundBrowserStaffUserIdsAsync();
  const pstnRingNormalized =
    ringE164.trim().length > 0 ? normalizeDialInputToE164(ringE164.trim()) : null;
  const browserFallbackActionUrl = publicBase
    ? `${publicBase}/api/twilio/voice/inbound-browser-fallback`
    : "";
  const statusCallbackUrl = publicBase ? `${publicBase}/api/twilio/voice/status` : "";
  const browserRingSec = resolveBrowserFirstRingTimeoutSeconds();

  const loopBlocked =
    pstnRingNormalized != null ? isPstnHandoffAiLoopRisk(pstnRingNormalized, callerId) : false;

  console.log(
    JSON.stringify({
      tag: "inbound-ring-diag",
      step: "buildVoiceHandoffTwiml",
      inbound_did_key_tail: phoneKeyForLoopCompare(callerId)?.slice(-4) ?? null,
      raw_ring_env_nonempty: ringE164.trim().length > 0,
      pstn_ring_normalized_ok: Boolean(pstnRingNormalized),
      browser_staff_count: inboundBrowserStaffIds.length,
      browser_staff_id_tails: inboundBrowserStaffIds.map((id) =>
        id.length >= 8 ? `${id.slice(0, 4)}…${id.slice(-4)}` : `${id.slice(0, 4)}…`
      ),
      will_dial_browser: inboundBrowserStaffIds.length > 0 && Boolean(browserFallbackActionUrl),
      pstn_loop_guard_blocked: loopBlocked,
      public_base_ok: Boolean(publicBase?.trim()),
    })
  );

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

    const clientIdentitiesForTwilio = inboundBrowserStaffIds.map((id) => softphoneTwilioClientIdentity(id));
    const clientBodies = inboundBrowserStaffIds
      .map((id) => clientDialNounXml(softphoneTwilioClientIdentity(id), callerId, clientDialExtras))
      .join("");

    console.log(
      JSON.stringify({
        tag: "inbound-ring-diag",
        step: "branch_browser_ring",
        outcome: "twiml_browser",
        client_identities_exact: clientIdentitiesForTwilio,
        identity_prefix: "saintly_",
        dial_action: "inbound-browser-fallback_then_pstn_via_TWILIO_VOICE_RING_E164",
      })
    );
    logInboundVoiceDebug("primary_client_dial_targets", {
      path: "legacy_buildVoiceHandoffTwiml",
      identities: clientIdentitiesForTwilio,
      user_id_tails: inboundBrowserStaffIds.map((id) => uuidTail(id)),
      ring_timeout_sec: browserRingSec,
      dial_action_url: browserFallbackActionUrl,
      pstn_fallback_after_timeout: !isTwilioVoiceDebugPstnFallbackDisabled(),
    });

    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${openingSay}
  <Dial${browserDialAttrs}>
    ${clientBodies}
  </Dial>
</Response>`.trim();
  }

  if (!pstnRingNormalized) {
    console.warn(
      JSON.stringify({
        tag: "inbound-ring-diag",
        step: "branch_pstn_unavailable",
        outcome: "voicemail_candidate",
        reason: "missing_or_unparseable_TWILIO_VOICE_RING_E164",
        raw_ring_env_nonempty: ringE164.trim().length > 0,
      })
    );
    console.warn(
      "[buildVoiceHandoffTwiml] branch=pstn UNAVAILABLE: no valid PSTN ring target after normalization and no browser targets"
    );
    return null;
  }

  if (loopBlocked) {
    console.warn(
      JSON.stringify({
        tag: "inbound-ring-diag",
        step: "branch_pstn_loop_blocked",
        outcome: "voicemail_candidate",
        reason: "TWILIO_VOICE_RING_E164_matches_inbound_DID_or_blocklist",
        ring_key_tail: phoneKeyForLoopCompare(pstnRingNormalized)?.slice(-4) ?? null,
      })
    );
    console.warn("[buildVoiceHandoffTwiml] branch=pstn BLOCKED: ring number matches inbound To — would re-enter voice webhook", {
      ringTail: pstnRingNormalized.replace(/\D/g, "").slice(-4),
      inboundToTail: callerId.replace(/\D/g, "").slice(-4),
      hint: "Set TWILIO_VOICE_INBOUND_STAFF_USER_IDS or staff_profiles.inbound_ring_enabled, or set TWILIO_VOICE_RING_E164 to a human PSTN line (not your Twilio public number).",
    });
    return null;
  }

  console.log(
    JSON.stringify({
      tag: "inbound-ring-diag",
      step: "branch_pstn_ring",
      outcome: "twiml_pstn",
      pstn_ring_key_tail: phoneKeyForLoopCompare(pstnRingNormalized)?.slice(-4) ?? null,
    })
  );

  if (isTwilioVoiceDebugPstnFallbackDisabled()) {
    logInboundVoiceDebug("pstn_only_leg_suppressed", {
      path: "buildVoiceHandoffTwiml_branch_pstn_only",
      reason: "TWILIO_VOICE_DEBUG_DISABLE_PSTN_FALLBACK",
    });
    return null;
  }

  return buildPstnNumberDialOpeningResponseXml({
    openingSay,
    publicBase,
    callerId,
    pstnRingNormalized,
  });
}

/**
 * Staged inbound: primary staff (server timer = &lt;Dial timeout&gt;), then `/inbound-escalation` runs
 * backup → PSTN → voicemail. Twilio enforces ring duration (no client timers).
 */
export async function buildEscalationInboundVoiceTwiml(input: {
  closing: string;
  publicBase: string;
  callerId: string;
  ringE164: string;
  clientDialExtras?: InboundCallerClientDialExtras | null;
}): Promise<string | null> {
  const { closing, publicBase, callerId, ringE164, clientDialExtras } = input;
  const primaryIds = await resolveInboundBrowserStaffUserIdsAsync();
  const backupIds = await resolveBackupInboundStaffUserIdsAsync();
  const pstnFallbackRaw = readEscalationPstnFallbackE164FromEnv() || ringE164;
  const pstnRingNormalized =
    pstnFallbackRaw.trim().length > 0 ? normalizeDialInputToE164(pstnFallbackRaw.trim()) : null;

  const escalationActionUrl = publicBase
    ? `${publicBase.trim().replace(/\/$/, "")}/api/twilio/voice/inbound-escalation?step=after_primary`
    : "";
  const skipPrimaryRedirectUrl = publicBase
    ? `${publicBase.trim().replace(/\/$/, "")}/api/twilio/voice/inbound-escalation?step=after_primary&primary_skipped=1`
    : "";
  const statusCallbackUrl = publicBase ? `${publicBase}/api/twilio/voice/status` : "";
  const primaryRingSec = resolveEscalationPrimaryRingTimeoutSeconds();

  const loopBlocked =
    pstnRingNormalized != null ? isPstnHandoffAiLoopRisk(pstnRingNormalized, callerId) : false;

  console.log(
    JSON.stringify({
      tag: "inbound-ring-diag",
      step: "buildEscalationInboundVoiceTwiml",
      primary_count: primaryIds.length,
      backup_count: backupIds.length,
      pstn_ring_ok: Boolean(pstnRingNormalized),
      pstn_loop_guard_blocked: loopBlocked,
      primary_ring_sec: primaryRingSec,
    })
  );
  logInboundVoiceDebug("escalation_client_targets", {
    primary_identities: primaryIds.map((id) => softphoneTwilioClientIdentity(id)),
    backup_identities: backupIds.map((id) => softphoneTwilioClientIdentity(id)),
    primary_user_id_tails: primaryIds.map((id) => uuidTail(id)),
    backup_user_id_tails: backupIds.map((id) => uuidTail(id)),
    pstn_fallback_after_timeout: !isTwilioVoiceDebugPstnFallbackDisabled(),
  });

  const openingSay =
    closing.trim().length > 0
      ? `<Say voice="Polly.Joanna">${escapeXml(closing)}</Say>`
      : "";

  if (primaryIds.length > 0 && escalationActionUrl) {
    const browserDialAttrs = publicBase
      ? ` answerOnBridge="true" timeout="${primaryRingSec}" callerId="${escapeXml(
          callerId
        )}" action="${escapeXml(
          escalationActionUrl
        )}" method="POST" statusCallback="${escapeXml(
          statusCallbackUrl
        )}" statusCallbackMethod="POST" statusCallbackEvent="initiated ringing answered completed"`
      : ` answerOnBridge="true" timeout="${primaryRingSec}" callerId="${escapeXml(callerId)}"`;

    const clientBodies = primaryIds
      .map((id) => clientDialNounXml(softphoneTwilioClientIdentity(id), callerId, clientDialExtras))
      .join("");

    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${openingSay}
  <Dial${browserDialAttrs}>
    ${clientBodies}
  </Dial>
</Response>`.trim();
  }

  if (primaryIds.length === 0 && backupIds.length > 0 && skipPrimaryRedirectUrl) {
    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${openingSay}
  <Redirect method="POST">${escapeXml(skipPrimaryRedirectUrl)}</Redirect>
</Response>`.trim();
  }

  if (!pstnRingNormalized) {
    return null;
  }

  if (loopBlocked) {
    return null;
  }

  if (isTwilioVoiceDebugPstnFallbackDisabled()) {
    logInboundVoiceDebug("pstn_only_leg_suppressed", {
      path: "buildEscalationInboundVoiceTwiml_pstn_only",
      reason: "TWILIO_VOICE_DEBUG_DISABLE_PSTN_FALLBACK",
    });
    return null;
  }

  return buildPstnNumberDialOpeningResponseXml({
    openingSay,
    publicBase,
    callerId,
    pstnRingNormalized,
    dialTimeoutSeconds: resolveEscalationPstnRingTimeoutSeconds(),
  });
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
  clientDialExtras?: InboundCallerClientDialExtras | null;
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
  const useEscalation = isVoiceEscalationPipelineEnabled() && isWithinBusinessHoursNow();
  const browserFallbackActionUrl = useEscalation
    ? `${base}/api/twilio/voice/inbound-escalation?step=after_primary`
    : `${base}/api/twilio/voice/inbound-browser-fallback`;
  const statusCallbackUrl = `${base}/api/twilio/voice/status`;
  const browserRingSec = useEscalation
    ? resolveEscalationPrimaryRingTimeoutSeconds()
    : resolveBrowserFirstRingTimeoutSeconds();
  const callerIdForDial = pstn || identity;

  const browserDialAttrs = ` answerOnBridge="true" timeout="${browserRingSec}" callerId="${escapeXml(
    callerIdForDial
  )}" action="${escapeXml(browserFallbackActionUrl)}" method="POST" statusCallback="${escapeXml(
    statusCallbackUrl
  )}" statusCallbackMethod="POST" statusCallbackEvent="initiated ringing answered completed"`;

  const clientBody = clientDialNounXml(identity, pstn, input.clientDialExtras);

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial${browserDialAttrs}>
    ${clientBody}
  </Dial>
</Response>`.trim();
}
