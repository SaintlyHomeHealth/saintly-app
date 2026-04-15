import type { SupabaseClient } from "@supabase/supabase-js";

import {
  appendSoftphoneTranscriptStreamParams,
  resolveTwilioMediaStreamWssUrl,
} from "@/lib/twilio/resolve-media-stream-wss-url";
import { startCallMediaStream } from "@/lib/twilio/start-call-media-stream";

function asRecord(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return {};
}

/** Manual “Enable transcript” uses POST /api/workspace/phone/conference/start-transcript — separate from this auto path. */
const MANUAL_ENABLE_TRANSCRIPT_PATH = "POST /api/workspace/phone/conference/start-transcript";

function inboundTranscriptAutostartEnvMode(): "on" | "off" {
  const raw = process.env.TWILIO_VOICE_INBOUND_TRANSCRIPT_ENABLED?.trim().toLowerCase();
  if (raw === "false") return "off";
  return "on";
}

function isInboundTranscriptEligibleSource(source: string): boolean {
  if (source === "twilio_voice_softphone") return false;
  if (source === "twilio_voice_outbound") return false;
  return true;
}

function isInProgressStatus(st: string): boolean {
  return st.trim().toLowerCase() === "in-progress";
}

function diagLog(payload: Record<string, unknown>): void {
  console.log(
    JSON.stringify({
      tag: "inbound-transcript-diag",
      manual_enable_transcript_path: MANUAL_ENABLE_TRANSCRIPT_PATH,
      ...payload,
    })
  );
}

/**
 * After inbound PSTN rings and is answered, attach a Twilio Media Stream for **transcript-only**:
 * same Railway bridge + `softphone_transcript=1` query as workspace softphone — **never** `inbound_ai`
 * (bridge fail-closes to transcript-only; no assistant audio, tools, or transfers).
 *
 * **Default on** when a valid `wss://` media URL exists. Opt out with
 * `TWILIO_VOICE_INBOUND_TRANSCRIPT_ENABLED=false`.
 */
export async function maybeStartInboundTranscriptStreamIfEligible(
  supabase: SupabaseClient,
  input: {
    callId: string;
    /** Parent inbound CallSid (matches `phone_calls.external_call_id` for stream attach). */
    resolvedExternalCallId: string;
    direction: string;
    /** Raw Twilio `CallStatus` from the status callback form (`payload.raw`). */
    rawCallStatus: string;
    /** Derived status passed into `applyTwilioVoiceStatusCallback` (e.g. from `deriveVoiceCallStatusFromPayload`). */
    derivedCallStatus: string;
    /** Pre-merge row metadata (`source` may be `twilio_voice_inbound_ring` or `twilio_voice_status_callback_ensure_parent`). */
    rowMetadata: Record<string, unknown>;
  }
): Promise<void> {
  const envMode = inboundTranscriptAutostartEnvMode();

  if (input.direction !== "inbound") {
    diagLog({
      outcome: "skipped",
      reason: "direction_not_inbound",
      gate_failed: "direction",
      inbound_transcript_autostart_env: envMode,
    });
    return;
  }

  const source = typeof input.rowMetadata.source === "string" ? input.rowMetadata.source.trim() : "";
  if (!isInboundTranscriptEligibleSource(source)) {
    diagLog({
      outcome: "skipped",
      reason: "metadata_source_not_eligible",
      gate_failed: "metadata.source",
      metadata_source: source || null,
      inbound_transcript_autostart_env: envMode,
    });
    return;
  }

  if (envMode === "off") {
    diagLog({
      outcome: "skipped",
      reason: "inbound_transcript_disabled_by_env",
      gate_failed: "TWILIO_VOICE_INBOUND_TRANSCRIPT_ENABLED",
      inbound_transcript_autostart_env: envMode,
      metadata_source: source || null,
    });
    return;
  }

  const rawSt = input.rawCallStatus.trim();
  const derivedSt = input.derivedCallStatus.trim();
  const inProgress = isInProgressStatus(rawSt) || isInProgressStatus(derivedSt);
  if (!inProgress) {
    diagLog({
      outcome: "skipped",
      reason: "call_status_not_in_progress",
      gate_failed: "CallStatus",
      raw_call_status: rawSt || null,
      derived_call_status: derivedSt || null,
      metadata_source: source || null,
      inbound_transcript_autostart_env: envMode,
    });
    return;
  }

  const ext = input.resolvedExternalCallId.trim();
  if (!ext.startsWith("CA")) {
    diagLog({
      outcome: "skipped",
      reason: "invalid_or_missing_call_sid",
      gate_failed: "resolvedExternalCallId",
      resolved_external_call_id_short: ext ? `${ext.slice(0, 8)}…` : null,
      metadata_source: source || null,
      inbound_transcript_autostart_env: envMode,
    });
    return;
  }

  const baseWss = resolveTwilioMediaStreamWssUrl();
  if (!baseWss.startsWith("wss://")) {
    diagLog({
      outcome: "skipped",
      reason: "media_stream_wss_not_configured",
      gate_failed: "TWILIO_SOFTPHONE_MEDIA_STREAM_WSS_URL_or_TWILIO_REALTIME_MEDIA_STREAM_WSS_URL",
      inbound_transcript_autostart_env: envMode,
      metadata_source: source || null,
      note: "REALTIME_BRIDGE_SHARED_SECRET is for the bridge HTTP API, not Twilio Streams REST",
    });
    return;
  }

  const { data: fresh, error: selErr } = await supabase
    .from("phone_calls")
    .select("metadata")
    .eq("id", input.callId)
    .maybeSingle();

  if (selErr || !fresh?.metadata) {
    diagLog({
      outcome: "skipped",
      reason: "phone_calls_row_or_metadata_unreadable",
      gate_failed: "row_read",
      detail: selErr?.message ?? "no row",
      inbound_transcript_autostart_env: envMode,
    });
    return;
  }

  const meta = asRecord(fresh.metadata);
  const voiceAi = asRecord(meta.voice_ai);
  if (typeof voiceAi.inbound_transcript_stream_started_at === "string") {
    diagLog({
      outcome: "skipped",
      reason: "inbound_transcript_stream_already_started",
      gate_failed: "idempotent",
      inbound_transcript_autostart_env: envMode,
    });
    return;
  }

  /**
   * Same WSS query as workspace transcript streams: `softphone_transcript=1` + roles.
   * **Never** append `inbound_ai=1` — that would enable conversational AI on the bridge.
   */
  const wssUrl = appendSoftphoneTranscriptStreamParams(baseWss, {
    transcriptExternalId: ext,
    inputRole: "caller",
  });

  diagLog({
    outcome: "attempt",
    reason: "starting_twilio_streams_rest",
    call_sid_short: ext.length > 10 ? `${ext.slice(0, 8)}…` : ext,
    transcript_only_url: true,
    inbound_ai_param: false,
    metadata_source: source || null,
    raw_call_status: rawSt || null,
    derived_call_status: derivedSt || null,
    inbound_transcript_autostart_env: envMode,
    inbound_transcript_autostart_attempted: true,
  });

  const result = await startCallMediaStream({
    callSid: ext,
    wssUrl,
    track: "both_tracks",
  });

  const now = new Date().toISOString();
  if (result.ok) {
    const nextVoiceAi = {
      ...voiceAi,
      inbound_transcript_stream_started_at: now,
      inbound_transcript_stream_sid: result.streamSid ?? null,
      inbound_transcript_mode: "transcript_only",
    };
    const { error: upErr } = await supabase
      .from("phone_calls")
      .update({
        metadata: {
          ...meta,
          voice_ai: nextVoiceAi,
        },
      })
      .eq("id", input.callId);

    if (upErr) {
      console.error("[inbound-transcript] metadata update failed:", upErr.message);
      diagLog({
        outcome: "skipped",
        reason: "metadata_persist_failed_after_stream_start",
        gate_failed: "supabase_update",
        detail: upErr.message,
      });
      return;
    }
    diagLog({
      outcome: "started",
      reason: "twilio_streams_ok",
      stream_sid: result.streamSid ?? null,
      metadata_source: source || null,
      inbound_transcript_autostart_env: envMode,
    });
    return;
  }

  const errMsg = result.error.slice(0, 2000);
  const nextVoiceAi = {
    ...voiceAi,
    inbound_transcript_last_error: errMsg,
    inbound_transcript_last_attempt_at: now,
  };
  await supabase
    .from("phone_calls")
    .update({
      metadata: {
        ...meta,
        voice_ai: nextVoiceAi,
      },
    })
    .eq("id", input.callId);

  diagLog({
    outcome: "twilio_streams_failed",
    reason: "twilio_streams_rest_error",
    error: errMsg.slice(0, 300),
    inbound_transcript_autostart_env: envMode,
  });
}
