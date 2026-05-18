import type { SupabaseClient } from "@supabase/supabase-js";

import { findPhoneCallRowByTwilioCallSidDetailed } from "@/lib/phone/phone-call-lookup-by-call-sid";
import { createRealtimeTranscription } from "@/lib/twilio/realtime-transcription-rest";
import { resolveTranscriptionStatusCallbackUrl } from "@/lib/twilio/resolve-transcription-callback-url";

function asRecord(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return {};
}

function inboundTranscriptEnvOn(): boolean {
  const raw = process.env.TWILIO_VOICE_INBOUND_TRANSCRIPT_ENABLED?.trim().toLowerCase();
  return raw !== "false";
}

/** Default on (same pattern as inbound) unless explicitly `false`. */
function outboundPstnTranscriptEnvOn(): boolean {
  const raw = process.env.TWILIO_VOICE_OUTBOUND_PSTN_TRANSCRIPT_ENABLED?.trim().toLowerCase();
  if (raw === "false") return false;
  return true;
}

export type PstnRealtimeTranscriptStartKind = "inbound_parent" | "outbound_pstn_bridge";

/**
 * Start Twilio Real-Time Transcription on a live `CA…` leg and persist start markers on the matching `phone_calls` row.
 * Fire-and-forget from PSTN bridge / team-ring TwiML routes (do not block Twilio).
 */
export async function startPstnRealtimeTranscriptionIfEligible(
  supabase: SupabaseClient,
  input: {
    twilioCallSid: string;
    kind: PstnRealtimeTranscriptStartKind;
    /** Correlates logs with TwiML routes (e.g. team_ring_confirm). */
    logSource: string;
  }
): Promise<void> {
  const sid = input.twilioCallSid.trim();
  if (!sid.startsWith("CA")) {
    console.log(
      JSON.stringify({
        event: "transcript_failed",
        reason: "invalid_call_sid",
        source: input.logSource,
        kind: input.kind,
      })
    );
    return;
  }

  if (input.kind === "inbound_parent" && !inboundTranscriptEnvOn()) {
    console.log(
      JSON.stringify({
        event: "transcript_failed",
        reason: "inbound_transcript_disabled_by_env",
        source: input.logSource,
        kind: input.kind,
        gate: "TWILIO_VOICE_INBOUND_TRANSCRIPT_ENABLED",
      })
    );
    return;
  }

  if (input.kind === "outbound_pstn_bridge" && !outboundPstnTranscriptEnvOn()) {
    console.log(
      JSON.stringify({
        event: "transcript_failed",
        reason: "outbound_pstn_transcript_disabled_by_env",
        source: input.logSource,
        kind: input.kind,
        gate: "TWILIO_VOICE_OUTBOUND_PSTN_TRANSCRIPT_ENABLED",
      })
    );
    return;
  }

  const callbackUrl = resolveTranscriptionStatusCallbackUrl();
  if (!callbackUrl) {
    console.log(
      JSON.stringify({
        event: "transcript_failed",
        reason: "transcription_status_callback_not_configured",
        source: input.logSource,
        kind: input.kind,
        gate: "TWILIO_PUBLIC_BASE_URL_or_TWILIO_WEBHOOK_BASE_URL",
      })
    );
    return;
  }

  const { row, lookup_path } = await findPhoneCallRowByTwilioCallSidDetailed(supabase, sid, {
    logLookup: false,
  });
  if (!row?.id) {
    console.log(
      JSON.stringify({
        event: "transcript_failed",
        reason: "phone_call_row_not_found",
        source: input.logSource,
        kind: input.kind,
        call_sid: `${sid.slice(0, 10)}…`,
        lookup_path,
      })
    );
    return;
  }

  const meta = asRecord(row.metadata);
  const voiceAi = asRecord(meta.voice_ai);

  if (input.kind === "inbound_parent") {
    if (typeof voiceAi.inbound_transcript_stream_started_at === "string") {
      return;
    }
  } else if (typeof voiceAi.outbound_pstn_bridge_transcript_stream_started_at === "string") {
    return;
  }

  const name = `saintly-pstn-${input.kind.replace(/_/g, "-")}-${sid.slice(-12)}`;

  const result = await createRealtimeTranscription({
    callSid: sid,
    track: "both_tracks",
    statusCallbackUrl: callbackUrl,
    name,
    partialResults: false,
  });

  const now = new Date().toISOString();

  if (result.ok) {
    const nextVoiceAi =
      input.kind === "inbound_parent"
        ? {
            ...voiceAi,
            inbound_transcript_stream_started_at: now,
            inbound_transcript_stream_sid: result.transcriptionSid,
            inbound_transcript_mode: "twilio_realtime_transcription",
            pstn_transcript_started_from: input.logSource,
          }
        : {
            ...voiceAi,
            outbound_pstn_bridge_transcript_stream_started_at: now,
            outbound_pstn_bridge_transcript_stream_sid: result.transcriptionSid,
            outbound_pstn_transcript_mode: "twilio_realtime_transcription",
            pstn_transcript_started_from: input.logSource,
          };

    const { error: upErr } = await supabase
      .from("phone_calls")
      .update({
        metadata: {
          ...meta,
          voice_ai: nextVoiceAi,
        },
      })
      .eq("id", row.id);

    if (upErr) {
      console.log(
        JSON.stringify({
          event: "transcript_failed",
          reason: "metadata_update_failed",
          source: input.logSource,
          kind: input.kind,
          phone_call_id: row.id,
          detail: upErr.message,
          transcription_sid: result.transcriptionSid,
        })
      );
      return;
    }

    console.log(
      JSON.stringify({
        event: "transcript_started",
        source: input.logSource,
        kind: input.kind,
        phone_call_id: row.id,
        call_sid: `${sid.slice(0, 10)}…`,
        transcription_sid: result.transcriptionSid,
        lookup_path,
      })
    );
    return;
  }

  const errMsg = result.error.slice(0, 2000);
  const nextVoiceAi = {
    ...voiceAi,
    pstn_transcript_last_error: errMsg,
    pstn_transcript_last_attempt_at: now,
    pstn_transcript_last_source: input.logSource,
  };
  await supabase
    .from("phone_calls")
    .update({
      metadata: {
        ...meta,
        voice_ai: nextVoiceAi,
      },
    })
    .eq("id", row.id);

  console.log(
    JSON.stringify({
      event: "transcript_failed",
      reason: "twilio_create_transcription_failed",
      source: input.logSource,
      kind: input.kind,
      phone_call_id: row.id,
      call_sid: `${sid.slice(0, 10)}…`,
      error: errMsg.slice(0, 400),
    })
  );
}
