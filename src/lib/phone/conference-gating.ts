import { resolveTwilioMediaStreamWssUrl } from "@/lib/twilio/resolve-media-stream-wss-url";

export type ConferenceGatingSnapshot = {
  conference_mode_env: boolean;
  /** Client (browser) leg — same as `phone_calls.external_call_id` for outbound softphone. */
  client_leg_call_sid: string;
  conference_sid: string | null;
  pstn_call_sid: string | null;
  /** True when hold / cold transfer to PSTN can run. */
  can_hold_pstn: boolean;
  can_cold_transfer: boolean;
  can_add_participant: boolean;
  /** Human-readable reasons controls stay disabled (staff-facing). */
  blockers: string[];
  media_stream_wss_configured: boolean;
  /** App can accept transcript POSTs from the Railway bridge (shared secret set on Vercel). */
  transcript_writeback_configured: boolean;
  /** Masked WSS target for support logs (host + path only). */
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
  } | null;
}): ConferenceGatingSnapshot {
  const conferenceModeEnv = process.env.TWILIO_SOFTPHONE_USE_CONFERENCE === "true";
  const wss = resolveTwilioMediaStreamWssUrl();
  const mediaOk = wss.startsWith("wss://");
  const transcriptWriteback = Boolean(process.env.REALTIME_BRIDGE_SHARED_SECRET?.trim());

  const clientSid = input.clientCallSid.trim();
  const sc = input.softphoneConference;
  const mode = (sc?.mode ?? "").trim().toLowerCase();
  const conferenceSid = typeof sc?.conference_sid === "string" ? sc.conference_sid.trim() : null;
  const pstnSid = typeof sc?.pstn_call_sid === "string" ? sc.pstn_call_sid.trim() : null;

  const blockers: string[] = [];
  if (!conferenceModeEnv) {
    blockers.push("Server: TWILIO_SOFTPHONE_USE_CONFERENCE is not true — outbound calls use legacy Dial, not Conference+PSTN.");
  }
  if (conferenceModeEnv && mode && mode !== "conference") {
    blockers.push(`This call was logged as mode "${sc?.mode}" — not a conference outbound.`);
  }
  if (conferenceModeEnv && mode === "conference" && !conferenceSid) {
    blockers.push(
      "Conference SID missing — Twilio has not yet posted softphone-conference-events with ConferenceSid, or the row lookup failed."
    );
  }
  if (conferenceModeEnv && mode === "conference" && !pstnSid) {
    blockers.push(
      "PSTN leg CallSid missing — join events did not correlate (expected PSTN participant CallSid ≠ client leg)."
    );
  }
  if (!mediaOk) {
    blockers.push("Media stream URL not configured — set TWILIO_SOFTPHONE_MEDIA_STREAM_WSS_URL or TWILIO_REALTIME_MEDIA_STREAM_WSS_URL (full wss://host/path).");
  }
  if (!transcriptWriteback) {
    blockers.push("Transcript writeback unavailable — REALTIME_BRIDGE_SHARED_SECRET not set on the web app (bridge cannot POST transcript).");
  }

  const baseReady =
    conferenceModeEnv && mode === "conference" && Boolean(conferenceSid) && Boolean(pstnSid);

  return {
    conference_mode_env: conferenceModeEnv,
    client_leg_call_sid: clientSid,
    conference_sid: conferenceSid,
    pstn_call_sid: pstnSid,
    can_hold_pstn: baseReady,
    can_cold_transfer: baseReady,
    can_add_participant: baseReady && Boolean(conferenceSid),
    blockers,
    media_stream_wss_configured: mediaOk,
    transcript_writeback_configured: transcriptWriteback,
    media_stream_wss_target_masked: maskWssUrl(wss),
  };
}
