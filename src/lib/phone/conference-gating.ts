import type { MoveToCellStatus } from "@/lib/phone/move-to-cell-types";
import { resolveTwilioMediaStreamWssUrl } from "@/lib/twilio/resolve-media-stream-wss-url";
import { resolveTranscriptionStatusCallbackUrl } from "@/lib/twilio/resolve-transcription-callback-url";

export const MOVE_TO_CELL_INBOUND_DISABLED_REASON =
  "Move to cell requires conference mode. Inbound conference is currently disabled.";

export type MoveToCellDisabledCode =
  | "inbound_conference_disabled"
  | "outbound_conference_disabled"
  | "missing_conference_mode"
  | "unsupported_call_mode"
  | "missing_conference_sid"
  | "missing_client_call_sid"
  | "missing_pstn_call_sid"
  | "unsupported_direction"
  | "conference_metadata_missing"
  | "move_to_cell_in_progress"
  | "move_to_cell_connected_on_cell"
  | "browser_leg_not_ready";

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
  /** Mid-call browser → staff cell (conference metadata + env + idle move_to_cell). */
  can_move_to_cell: boolean;
  /** Primary staff-facing reason Move to cell is disabled (tooltip). */
  move_to_cell_disabled_reason: string | null;
  /** Machine codes for logs / diagnostics. */
  move_to_cell_disabled_codes: MoveToCellDisabledCode[];
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

function computeMoveToCellEligibility(input: {
  conferenceModeEnv: boolean;
  inboundConferenceEnabled: boolean;
  clientCallSid: string;
  callDirection: "inbound" | "outbound" | null;
  softphoneConference: {
    mode?: string | null;
    conference_sid?: string | null;
    pstn_call_sid?: string | null;
    direction?: string | null;
    client_call_sid?: string | null;
  } | null;
  moveToCellStatus: MoveToCellStatus | null;
}): {
  can_move_to_cell: boolean;
  disabled_reason: string | null;
  disabled_codes: MoveToCellDisabledCode[];
} {
  const codes: MoveToCellDisabledCode[] = [];
  const sc = input.softphoneConference;
  const mode = (sc?.mode ?? "").trim().toLowerCase();
  const metaDirection =
    sc?.direction === "inbound" || sc?.direction === "outbound" ? sc.direction : null;
  const direction =
    metaDirection ??
    input.callDirection ??
    (mode === "conference" && input.conferenceModeEnv && !input.inboundConferenceEnabled
      ? "outbound"
      : null);
  const conferenceSid =
    typeof sc?.conference_sid === "string" && sc.conference_sid.startsWith("CF")
      ? sc.conference_sid.trim()
      : null;
  const pstnSid =
    typeof sc?.pstn_call_sid === "string" && sc.pstn_call_sid.startsWith("CA")
      ? sc.pstn_call_sid.trim()
      : null;
  const storedBrowserSid =
    typeof sc?.client_call_sid === "string" && sc.client_call_sid.startsWith("CA")
      ? sc.client_call_sid.trim()
      : null;
  const browserSid = storedBrowserSid ?? (input.clientCallSid.startsWith("CA") ? input.clientCallSid.trim() : null);

  const moveStatus = input.moveToCellStatus ?? "idle";
  if (moveStatus === "ringing" || moveStatus === "press_1") {
    codes.push("move_to_cell_in_progress");
  } else if (moveStatus === "connected_on_cell") {
    codes.push("move_to_cell_connected_on_cell");
  }

  if (direction === "inbound" && !input.inboundConferenceEnabled) {
    codes.push("inbound_conference_disabled");
  }
  if (direction === "outbound" && !input.conferenceModeEnv) {
    codes.push("outbound_conference_disabled");
  }

  if (!sc) {
    codes.push("conference_metadata_missing");
  } else if (!mode) {
    codes.push("missing_conference_mode");
  } else if (mode !== "conference") {
    codes.push("unsupported_call_mode");
  }

  if (!direction || (direction !== "inbound" && direction !== "outbound")) {
    codes.push("unsupported_direction");
  }

  if (!conferenceSid) {
    codes.push("missing_conference_sid");
  }
  if (!browserSid) {
    codes.push("missing_client_call_sid");
  }
  if (!pstnSid) {
    codes.push("missing_pstn_call_sid");
  }
  if (direction === "inbound" && input.inboundConferenceEnabled && !storedBrowserSid) {
    codes.push("browser_leg_not_ready");
  }

  const can_move_to_cell = codes.length === 0;

  let disabled_reason: string | null = null;
  if (!can_move_to_cell) {
    if (codes.includes("inbound_conference_disabled")) {
      disabled_reason = MOVE_TO_CELL_INBOUND_DISABLED_REASON;
    } else if (codes.includes("move_to_cell_connected_on_cell")) {
      disabled_reason = "Call is already connected on your cell.";
    } else if (codes.includes("move_to_cell_in_progress")) {
      disabled_reason = "Move to cell is already in progress.";
    } else if (codes.includes("outbound_conference_disabled")) {
      disabled_reason = "Move to cell requires conference mode. Outbound conference is disabled.";
    } else if (codes.includes("missing_conference_sid")) {
      disabled_reason =
        "Conference is not ready yet — waiting for Twilio conference events (ConferenceSid).";
    } else if (codes.includes("missing_client_call_sid")) {
      disabled_reason = "Browser leg CallSid missing in conference metadata.";
    } else if (codes.includes("missing_pstn_call_sid")) {
      disabled_reason = "Customer/PSTN leg CallSid missing in conference metadata.";
    } else if (codes.includes("browser_leg_not_ready")) {
      disabled_reason = "Browser leg not connected yet — answer the call on the softphone first.";
    } else if (codes.includes("conference_metadata_missing") || codes.includes("missing_conference_mode")) {
      disabled_reason = "Move to cell requires an active conference call.";
    } else if (codes.includes("unsupported_call_mode")) {
      disabled_reason = `Move to cell is not available for call mode "${sc?.mode ?? "unknown"}".`;
    } else {
      disabled_reason = "Move to cell is not available on this call yet.";
    }
  }

  return { can_move_to_cell, disabled_reason, disabled_codes: codes };
}

/**
 * Server-side truth for which conference actions are safe (no guessing in the UI).
 */
export function computeConferenceGating(input: {
  clientCallSid: string;
  /** `phone_calls.direction` when conference metadata has no direction yet. */
  callDirection?: "inbound" | "outbound" | null;
  moveToCellStatus?: MoveToCellStatus | null;
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

  const callDirection =
    direction === "inbound" || direction === "outbound"
      ? direction
      : input.callDirection === "inbound" || input.callDirection === "outbound"
        ? input.callDirection
        : null;

  const moveToCell = computeMoveToCellEligibility({
    conferenceModeEnv,
    inboundConferenceEnabled,
    clientCallSid: clientSid,
    callDirection,
    softphoneConference: sc,
    moveToCellStatus: input.moveToCellStatus ?? null,
  });

  const blockers: string[] = [];
  if (!isInboundConference && !isOutboundConference) {
    if (callDirection === "inbound" && !inboundConferenceEnabled) {
      blockers.push(MOVE_TO_CELL_INBOUND_DISABLED_REASON);
    } else if (!conferenceModeEnv && !inboundConferenceEnabled) {
      blockers.push(
        "Server: conference mode is off — enable TWILIO_SOFTPHONE_USE_CONFERENCE=true (outbound) or TWILIO_INBOUND_USE_CONFERENCE=1 (inbound)."
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

  for (const code of moveToCell.disabled_codes) {
    if (code === "inbound_conference_disabled" && !blockers.includes(MOVE_TO_CELL_INBOUND_DISABLED_REASON)) {
      blockers.push(MOVE_TO_CELL_INBOUND_DISABLED_REASON);
    }
  }

  return {
    conference_mode_env: conferenceModeEnv,
    inbound_conference_enabled: inboundConferenceEnabled,
    client_leg_call_sid: clientSid,
    conference_sid: conferenceSid,
    pstn_call_sid: pstnSid,
    can_hold_pstn: baseReady,
    can_cold_transfer: baseReady,
    can_add_participant: baseReady && Boolean(conferenceSid),
    can_move_to_cell: moveToCell.can_move_to_cell,
    move_to_cell_disabled_reason: moveToCell.disabled_reason,
    move_to_cell_disabled_codes: moveToCell.disabled_codes,
    blockers,
    media_stream_wss_configured: mediaOk,
    transcription_callback_configured: transcriptionCallbackOk,
    legacy_bridge_transcript_configured: legacyBridge,
    transcript_writeback_configured: transcriptWriteback,
    media_stream_wss_target_masked: maskWssUrl(wss),
  };
}
