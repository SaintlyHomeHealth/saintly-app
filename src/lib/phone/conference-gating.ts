import { resolveTwilioMediaStreamWssUrl } from "@/lib/twilio/resolve-media-stream-wss-url";
import { resolveTranscriptionStatusCallbackUrl } from "@/lib/twilio/resolve-transcription-callback-url";

export type ConferenceGatingSnapshot = {
  conference_mode_env: boolean;
  /** Inbound browser conference (opt-in via `TWILIO_INBOUND_USE_CONFERENCE=1`). */
  inbound_conference_enabled: boolean;
  /** Client (browser) leg — active Voice SDK CallSid from the UI. */
  client_leg_call_sid: string;
  conference_sid: string | null;
  pstn_call_sid: string | null;
  /** True when hold / cold transfer to PSTN can run. */
  can_hold_pstn: boolean;
  can_cold_transfer: boolean;
  can_add_participant: boolean;
  /** Mid-call browser → staff cell (conference + configured cell). */
  can_move_to_cell: boolean;
  /** Human-readable reasons controls stay disabled (staff-facing). */
  blockers: string[];
  media_stream_wss_configured: boolean;
  /** Twilio Real-Time Transcription callback URL (TWILIO_WEBHOOK_BASE_URL or TWILIO_PUBLIC_BASE_URL). */
  transcription_callback_configured: boolean;
  /** Legacy Railway bridge HTTP ingest — optional if using native Twilio transcription only. */
  legacy_bridge_transcript_configured: boolean;
  /**
   * True when live transcript lines can be persisted: native Twilio callback **or** legacy bridge secret.
   */
  transcript_writeback_configured: boolean;
  /** Masked WSS target for support logs (host + path only) — legacy Media Streams. */
  media_stream_wss_target_masked: string | null;
};

function maskWssUrl(url: string): string | null {
  const t = url.trim();
  if (!t) return null;
  try {
    const u = new URL(t);
    return `wss://${u.host}${u.pathname}`;
  } catch {
    return t.length > 24 ? `${t.slice(0, 20)}…` : t;
  }
}

/**
 * Server-side truth for which conference actions are safe (no guessing in the UI).
 */
export function computeConferenceGating(input: {
  clientCallSid: string;
  softphoneConference: {
    mode?: string | null;
    conference_sid?: string | null;
    pstn_call_sid?: string | null;
    direction?: string | null;
    client_call_sid?: string | null;
  } | null;
}): ConferenceGatingSnapshot {
  const conferenceModeEnv = process.env.TWILIO_SOFTPHONE_USE_CONFERENCE === "true";
  const inboundConfEnv = process.env.TWILIO_INBOUND_USE_CONFERENCE?.trim().toLowerCase() ?? "";
  const inboundConferenceEnabled =
    inboundConfEnv === "1" || inboundConfEnv === "true" || inboundConfEnv === "yes";

  const wss = resolveTwilioMediaStreamWssUrl();
  const mediaOk = wss.startsWith("wss://");
  const callbackUrl = resolveTranscriptionStatusCallbackUrl();
  const transcriptionCallbackOk = Boolean(callbackUrl);
  const legacyBridge = Boolean(process.env.REALTIME_BRIDGE_SHARED_SECRET?.trim());
  const transcriptWriteback = transcriptionCallbackOk || legacyBridge;

  const clientSid = input.clientCallSid.trim();
  const sc = input.softphoneConference;
  const mode = (sc?.mode ?? "").trim().toLowerCase();
  const direction = (sc?.direction ?? "").trim().toLowerCase();
  const conferenceSid = typeof sc?.conference_sid === "string" ? sc.conference_sid.trim() : null;
  const pstnSid = typeof sc?.pstn_call_sid === "string" ? sc.pstn_call_sid.trim() : null;
  const storedBrowserSid =
    typeof sc?.client_call_sid === "string" && sc.client_call_sid.startsWith("CA")
      ? sc.client_call_sid.trim()
      : null;

  const isInboundConference = inboundConferenceEnabled && direction === "inbound" && mode === "conference";
  const isOutboundConference = conferenceModeEnv && mode === "conference" && direction !== "inbound";

  const blockers: string[] = [];
  if (!isInboundConference && !isOutboundConference) {
    if (!conferenceModeEnv && !inboundConferenceEnabled) {
      blockers.push(
        "Server: conference mode is off — enable TWILIO_SOFTPHONE_USE_CONFERENCE (outbound) or inbound browser conference (default on)."
      );
    } else if (mode && mode !== "conference") {
      blockers.push(`This call was logged as mode "${sc?.mode}" — not a conference call.`);
    } else if (!mode) {
      blockers.push("Conference metadata not present on this call yet.");
    }
  }
  if ((isInboundConference || isOutboundConference) && !conferenceSid) {
    blockers.push(
      "Conference SID missing — Twilio has not yet posted softphone-conference-events with ConferenceSid."
    );
  }
  if ((isInboundConference || isOutboundConference) && !pstnSid) {
    blockers.push("Customer/PSTN leg CallSid missing in conference metadata.");
  }
  if (isInboundConference && !storedBrowserSid) {
    blockers.push("Browser leg not connected yet — answer the call on the softphone first.");
  }
  if (!transcriptionCallbackOk && !legacyBridge) {
    blockers.push(
      "Live transcript unavailable — set TWILIO_WEBHOOK_BASE_URL or TWILIO_PUBLIC_BASE_URL for Twilio Real-Time Transcription, or REALTIME_BRIDGE_SHARED_SECRET for the legacy bridge."
    );
  }

  const browserLegReady = isInboundConference ? Boolean(storedBrowserSid) : Boolean(clientSid.startsWith("CA"));
  const baseReady =
    (isInboundConference || isOutboundConference) &&
    Boolean(conferenceSid) &&
    Boolean(pstnSid) &&
    browserLegReady;

  return {
    conference_mode_env: conferenceModeEnv,
    inbound_conference_enabled: inboundConferenceEnabled,
    client_leg_call_sid: clientSid,
    conference_sid: conferenceSid,
    pstn_call_sid: pstnSid,
    can_hold_pstn: baseReady,
    can_cold_transfer: baseReady,
    can_add_participant: baseReady && Boolean(conferenceSid),
    can_move_to_cell: baseReady && Boolean(conferenceSid),
    blockers,
    media_stream_wss_configured: mediaOk,
    transcription_callback_configured: transcriptionCallbackOk,
    legacy_bridge_transcript_configured: legacyBridge,
    transcript_writeback_configured: transcriptWriteback,
    media_stream_wss_target_masked: maskWssUrl(wss),
  };
}
