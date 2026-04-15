import type { SupabaseClient } from "@supabase/supabase-js";

import { findPhoneCallRowByTwilioCallSid } from "@/lib/phone/phone-call-lookup-by-call-sid";
import type { SoftphoneTranscriptStreamsMeta } from "@/lib/phone/softphone-transcript-stream-meta";
import { createRealtimeTranscription } from "@/lib/twilio/realtime-transcription-rest";
import { resolveTranscriptionStatusCallbackUrl } from "@/lib/twilio/resolve-transcription-callback-url";

export type { SoftphoneTranscriptStreamsMeta } from "@/lib/phone/softphone-transcript-stream-meta";

function asRecord(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return {};
}

export function mergeSoftphoneTranscriptStreamsIntoVoiceAi(
  voiceAi: Record<string, unknown> | null | undefined,
  patch: Partial<SoftphoneTranscriptStreamsMeta>
): Record<string, unknown> {
  const base = voiceAi && typeof voiceAi === "object" && !Array.isArray(voiceAi) ? { ...voiceAi } : {};
  const prev =
    base.softphone_transcript_streams && typeof base.softphone_transcript_streams === "object"
      ? { ...(base.softphone_transcript_streams as Record<string, unknown>) }
      : {};
  return {
    ...base,
    softphone_transcript_streams: { ...prev, ...patch },
  };
}

export async function upsertPhoneCallTranscriptStreams(
  supabase: SupabaseClient,
  twilioCallSid: string,
  patch: Partial<SoftphoneTranscriptStreamsMeta>
): Promise<void> {
  const sid = twilioCallSid.trim();
  if (!sid.startsWith("CA")) return;

  const row = await findPhoneCallRowByTwilioCallSid(supabase, sid);
  if (!row?.id) return;

  const meta = asRecord(row.metadata);
  const voiceAi = asRecord(meta.voice_ai);
  meta.voice_ai = mergeSoftphoneTranscriptStreamsIntoVoiceAi(voiceAi, patch);

  const { error: upErr } = await supabase.from("phone_calls").update({ metadata: meta }).eq("id", row.id);
  if (upErr) {
    console.error("[softphone-transcript-streams] upsert_failed", upErr.message);
  }
}

function readTranscriptStreamsFromMetadata(meta: Record<string, unknown>): SoftphoneTranscriptStreamsMeta | null {
  const voiceAi = meta.voice_ai;
  if (!voiceAi || typeof voiceAi !== "object" || Array.isArray(voiceAi)) return null;
  const raw = (voiceAi as Record<string, unknown>).softphone_transcript_streams;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as SoftphoneTranscriptStreamsMeta;
}

function readPstnCallSidFromMetadata(meta: Record<string, unknown>): string | null {
  const sc = meta.softphone_conference;
  if (!sc || typeof sc !== "object" || Array.isArray(sc)) return null;
  const p = (sc as Record<string, unknown>).pstn_call_sid;
  return typeof p === "string" && p.startsWith("CA") ? p.trim() : null;
}

function clientTranscriptEverStarted(streams: SoftphoneTranscriptStreamsMeta | null): boolean {
  if (!streams) return false;
  if (typeof streams.client_realtime_transcription_started_at === "string") return true;
  if (typeof streams.client_stream_started_at === "string") return true;
  return false;
}

function pstnTranscriptAlreadyStarted(streams: SoftphoneTranscriptStreamsMeta | null): boolean {
  if (!streams) return false;
  if (typeof streams.pstn_realtime_transcription_started_at === "string") return true;
  if (typeof streams.pstn_stream_started_at === "string") return true;
  return false;
}

/**
 * Starts the PSTN-leg real-time transcription when the client leg transcription was already started
 * but `pstn_call_sid` was not yet on the row (or PSTN start failed earlier).
 */
export async function maybeStartDeferredPstnTranscriptStream(
  supabase: SupabaseClient,
  clientExternalCallId: string,
  reason: string
): Promise<{
  ok: boolean;
  skipped?: string;
  pstnStreamSid?: string | null;
  pstnRealtimeTranscriptionSid?: string | null;
  error?: string;
}> {
  const sid = clientExternalCallId.trim();
  if (!sid.startsWith("CA")) return { ok: false, skipped: "invalid_client_sid" };

  const callbackUrl = resolveTranscriptionStatusCallbackUrl();
  if (!callbackUrl) {
    return { ok: false, skipped: "transcription_status_callback_not_configured" };
  }

  const row = await findPhoneCallRowByTwilioCallSid(supabase, sid);
  if (!row?.id) {
    return { ok: false, skipped: "phone_call_not_found" };
  }

  const meta = row.metadata;
  const streams = readTranscriptStreamsFromMetadata(asRecord(meta));
  if (!clientTranscriptEverStarted(streams)) {
    return { ok: false, skipped: "client_transcript_never_started" };
  }
  if (pstnTranscriptAlreadyStarted(streams)) {
    return {
      ok: true,
      skipped: "pstn_stream_already_started",
      pstnStreamSid: streams?.pstn_stream_sid ?? null,
      pstnRealtimeTranscriptionSid: streams?.pstn_realtime_transcription_sid ?? null,
    };
  }

  const pstnSid = readPstnCallSidFromMetadata(asRecord(meta));
  if (!pstnSid) {
    return { ok: true, skipped: "no_pstn_call_sid_on_row" };
  }

  const name = `saintly-pstn-rt-${pstnSid.slice(-12)}`;

  const pstnResult = await createRealtimeTranscription({
    callSid: pstnSid,
    track: "inbound_track",
    statusCallbackUrl: callbackUrl,
    name,
    partialResults: false,
  });

  const now = new Date().toISOString();
  if (pstnResult.ok) {
    await upsertPhoneCallTranscriptStreams(supabase, sid, {
      pstn_realtime_transcription_sid: pstnResult.transcriptionSid,
      pstn_realtime_transcription_started_at: now,
      pstn_call_sid_at_attempt: pstnSid,
      pstn_stream_last_error: null,
      pstn_stream_last_attempt_at: now,
    });
    console.warn("[transcript] pstn_realtime_transcription_started", {
      clientCallSid: sid.slice(0, 12) + "…",
      pstnCallSid: pstnSid.slice(0, 12) + "…",
    });
    return { ok: true, pstnRealtimeTranscriptionSid: pstnResult.transcriptionSid };
  }

  const errFull = pstnResult.error;
  await upsertPhoneCallTranscriptStreams(supabase, sid, {
    pstn_stream_last_error: errFull.slice(0, 4000),
    pstn_stream_last_attempt_at: now,
    pstn_call_sid_at_attempt: pstnSid,
  });
  console.warn("[transcript] pstn_realtime_transcription_start_failed", {
    reason,
    pstnCallSid: pstnSid.slice(0, 12) + "…",
    error: errFull,
  });
  return { ok: false, error: errFull };
}
