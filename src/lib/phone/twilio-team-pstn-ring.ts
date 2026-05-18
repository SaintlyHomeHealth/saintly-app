/**
 * Simultaneous inbound ring to multiple staff cell numbers via Twilio &lt;Dial&gt;&lt;Number&gt;&lt;/Number&gt;&lt;/Dial&gt; (no &lt;Client&gt;).
 *
 * @see TWILIO_VOICE_TEAM_RING_E164S — comma-separated E.164 / NANP numbers
 * @see TWILIO_VOICE_TEAM_RING_CONFIRM_ENABLED — `0` to skip press-1 screening (voicemail may steal calls)
 */

import { isPstnHandoffAiLoopRisk, phoneKeyForLoopCompare } from "@/lib/phone/twilio-voice-pstn-loop-guard";
import { resolvePstnOnlyInboundDialTimeoutSeconds } from "@/lib/phone/voice-inbound-ring-strategy";
import { normalizeDialInputToE164 } from "@/lib/softphone/phone-number";

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Team cell/office lines for simultaneous PSTN ring on the main DID.
 * `TWILIO_VOICE_TEAM_RING_E164S=+1...,+1...` (comma, semicolon, or whitespace separated).
 */
export function readTwilioVoiceTeamRingE164sFromEnv(): string[] {
  const raw = process.env.TWILIO_VOICE_TEAM_RING_E164S?.trim() ?? "";
  if (!raw) return [];
  const parts = raw.split(/[,;\s]+/).map((s) => s.trim().replace(/^["']|["']$/g, ""));
  const out: string[] = [];
  const seen = new Set<string>();
  for (const p of parts) {
    if (!p) continue;
    const n = normalizeDialInputToE164(p);
    if (!n) continue;
    const k = n.replace(/\D/g, "");
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(n);
  }
  return out;
}

/**
 * When `true` (default), each answered leg runs `/api/twilio/voice/team-ring-screen` (press 1 to bridge).
 * Set `TWILIO_VOICE_TEAM_RING_CONFIRM_ENABLED=0` to connect immediately (personal voicemail may answer).
 */
export function resolveTeamRingConfirmEnabled(): boolean {
  const v = process.env.TWILIO_VOICE_TEAM_RING_CONFIRM_ENABLED?.trim().toLowerCase() ?? "";
  if (v === "0" || v === "false" || v === "no") {
    return false;
  }
  return true;
}

export type BuildSimultaneousTeamPstnDialTwimlInput = {
  openingSay: string;
  publicBase: string;
  /** Outbound CLI — use PSTN caller’s number when available (see `resolveInboundCallerIdForClientDial`). */
  callerId: string;
  teamE164s: string[];
  dialTimeoutSeconds?: number;
  confirmEnabled?: boolean;
};

/**
 * One &lt;Dial&gt; with multiple &lt;Number&gt; nouns — Twilio rings them in parallel; first leg to complete screening bridges.
 * Twilio caps simultaneous endpoints (typically ~10).
 */
export function buildSimultaneousTeamPstnDialTwiml(input: BuildSimultaneousTeamPstnDialTwimlInput): string | null {
  const base = input.publicBase.trim().replace(/\/$/, "");
  if (!base || input.teamE164s.length === 0) {
    return null;
  }

  const filtered = input.teamE164s.filter((e164) => !isPstnHandoffAiLoopRisk(e164, input.callerId));
  if (filtered.length === 0) {
    console.warn(
      JSON.stringify({
        tag: "inbound-ring-diag",
        step: "buildSimultaneousTeamPstnDialTwiml",
        outcome: "all_team_numbers_loop_guarded",
      })
    );
    return null;
  }

  const dialSec = input.dialTimeoutSeconds ?? resolvePstnOnlyInboundDialTimeoutSeconds();
  const confirm = input.confirmEnabled ?? resolveTeamRingConfirmEnabled();
  const dialActionUrl = `${base}/api/twilio/voice/dial-result`;
  const statusCallbackUrl = `${base}/api/twilio/voice/status`;
  const screenUrl = `${base}/api/twilio/voice/team-ring-screen`;

  const numberInner = filtered
    .map((e164) =>
      confirm
        ? `<Number url="${escapeXml(screenUrl)}" method="POST">${escapeXml(e164)}</Number>`
        : `<Number>${escapeXml(e164)}</Number>`
    )
    .join("");

  console.log(
    JSON.stringify({
      tag: "inbound-voice-flow",
      event: "team_pstn_simultaneous_dial_twiml_built",
      leg_count: filtered.length,
      press_1_confirm: confirm,
      dial_timeout_sec: dialSec,
      pstn_key_tails: filtered.map((e) => phoneKeyForLoopCompare(e)?.slice(-4) ?? e.replace(/\D/g, "").slice(-4)),
      dial_action: "dial-result",
    })
  );

  const pstnDialAttrs = ` answerOnBridge="true" timeout="${dialSec}" callerId="${escapeXml(
    input.callerId
  )}" action="${escapeXml(dialActionUrl)}" method="POST" statusCallback="${escapeXml(
    statusCallbackUrl
  )}" statusCallbackMethod="POST" statusCallbackEvent="initiated ringing answered completed"`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${input.openingSay}
  <Dial${pstnDialAttrs}>
    ${numberInner}
  </Dial>
</Response>`.trim();
}
