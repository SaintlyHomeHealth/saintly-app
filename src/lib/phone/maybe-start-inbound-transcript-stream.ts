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

/**
 * After inbound PSTN rings and is answered, attach a Twilio Media Stream for **transcript-only**:
 * same Railway bridge + `softphone_transcript=1` query as workspace softphone — **never** `inbound_ai`
 * (bridge fail-closes to transcript-only; no assistant audio, tools, or transfers).
 *
 * Opt-in: `TWILIO_VOICE_INBOUND_TRANSCRIPT_ENABLED=true` and a valid `wss://` media URL in env.
 */
export async function maybeStartInboundTranscriptStreamIfEligible(
  supabase: SupabaseClient,
  input: {
    callId: string;
    /** Parent inbound CallSid (matches `phone_calls.external_call_id`). */
    resolvedExternalCallId: string;
    direction: string;
    /** Raw Twilio `CallStatus` from the status callback. */
    rawCallStatus: string;
    /** Pre-merge row metadata (must include `source` for inbound DID calls). */
    rowMetadata: Record<string, unknown>;
  }
): Promise<void> {
  if (input.direction !== "inbound") return;
  const source = typeof input.rowMetadata.source === "string" ? input.rowMetadata.source.trim() : "";
  if (source !== "twilio_voice_inbound_ring") return;

  if (process.env.TWILIO_VOICE_INBOUND_TRANSCRIPT_ENABLED?.trim() !== "true") {
    return;
  }

  const st = input.rawCallStatus.trim().toLowerCase();
  if (st !== "in-progress") return;

  const ext = input.resolvedExternalCallId.trim();
  if (!ext.startsWith("CA")) return;

  const baseWss = resolveTwilioMediaStreamWssUrl();
  if (!baseWss.startsWith("wss://")) {
    console.log(
      JSON.stringify({
        tag: "inbound-transcript-diag",
        outcome: "skipped",
        reason: "media_stream_wss_not_configured",
      })
    );
    return;
  }

  const { data: fresh, error: selErr } = await supabase
    .from("phone_calls")
    .select("metadata")
    .eq("id", input.callId)
    .maybeSingle();

  if (selErr || !fresh?.metadata) {
    console.warn("[inbound-transcript] skip row read:", selErr?.message ?? "no row");
    return;
  }

  const meta = asRecord(fresh.metadata);
  const voiceAi = asRecord(meta.voice_ai);
  if (typeof voiceAi.inbound_transcript_stream_started_at === "string") {
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

  console.log(
    JSON.stringify({
      tag: "inbound-transcript-diag",
      outcome: "attempt",
      call_sid_short: ext.length > 10 ? `${ext.slice(0, 8)}…` : ext,
      transcript_only_url: true,
      inbound_ai_param: false,
    })
  );

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
      return;
    }
    console.log(
      JSON.stringify({
        tag: "inbound-transcript-diag",
        outcome: "started",
        stream_sid: result.streamSid ?? null,
      })
    );
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

  console.warn(
    JSON.stringify({
      tag: "inbound-transcript-diag",
      outcome: "twilio_streams_failed",
      error: errMsg.slice(0, 300),
    })
  );
}
