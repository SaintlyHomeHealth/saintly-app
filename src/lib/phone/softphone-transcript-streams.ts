import type { SupabaseClient } from "@supabase/supabase-js";

import type { SoftphoneTranscriptStreamsMeta } from "@/lib/phone/softphone-transcript-stream-meta";
import {
  appendSoftphoneTranscriptStreamParams,
  resolveTwilioMediaStreamWssUrl,
} from "@/lib/twilio/resolve-media-stream-wss-url";
import { startCallMediaStream } from "@/lib/twilio/start-call-media-stream";

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
  externalCallId: string,
  patch: Partial<SoftphoneTranscriptStreamsMeta>
): Promise<void> {
  const sid = externalCallId.trim();
  if (!sid.startsWith("CA")) return;

  const { data: row, error: selErr } = await supabase
    .from("phone_calls")
    .select("id, metadata")
    .eq("external_call_id", sid)
    .maybeSingle();

  if (selErr || !row?.id) return;

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

/**
 * Starts the PSTN-leg inbound transcript stream when the Client stream was already started
 * but `pstn_call_sid` was not yet on the row (or PSTN start failed earlier).
 * Idempotent when `pstn_stream_started_at` is set.
 */
export async function maybeStartDeferredPstnTranscriptStream(
  supabase: SupabaseClient,
  clientExternalCallId: string,
  reason: string
): Promise<{ ok: boolean; skipped?: string; pstnStreamSid?: string | null; error?: string }> {
  const sid = clientExternalCallId.trim();
  if (!sid.startsWith("CA")) return { ok: false, skipped: "invalid_client_sid" };

  const baseWss = resolveTwilioMediaStreamWssUrl();
  if (!baseWss?.startsWith("wss://")) {
    console.log("[maybe-start-pstn-transcript] skipped_no_wss", {
      reason,
      clientCallSid: sid.slice(0, 12) + "…",
    });
    return { ok: false, skipped: "media_stream_wss_not_configured" };
  }

  const { data: row, error: selErr } = await supabase
    .from("phone_calls")
    .select("id, metadata")
    .eq("external_call_id", sid)
    .maybeSingle();

  if (selErr || !row?.id) {
    return { ok: false, skipped: "phone_call_not_found" };
  }

  const meta = asRecord(row.metadata);
  const streams = readTranscriptStreamsFromMetadata(meta);
  if (!streams?.client_stream_started_at) {
    return { ok: false, skipped: "client_transcript_never_started" };
  }
  if (streams.pstn_stream_started_at) {
    return { ok: true, skipped: "pstn_stream_already_started", pstnStreamSid: streams.pstn_stream_sid ?? null };
  }

  const pstnSid = readPstnCallSidFromMetadata(meta);
  if (!pstnSid) {
    console.log("[maybe-start-pstn-transcript] skipped_no_pstn_sid", { reason, clientCallSid: sid.slice(0, 12) + "…" });
    /** Not an error — PSTN leg not linked yet; merge hook or client will retry. */
    return { ok: true, skipped: "no_pstn_call_sid_on_row" };
  }

  const pstnWss = appendSoftphoneTranscriptStreamParams(baseWss, {
    transcriptExternalId: sid,
    inputRole: "caller",
  });

  console.log("[maybe-start-pstn-transcript] twilio_request", {
    reason,
    clientCallSid: sid.slice(0, 12) + "…",
    pstnCallSid: pstnSid.slice(0, 12) + "…",
    track: "inbound_track",
    wssUrl: pstnWss,
  });

  const pstnResult = await startCallMediaStream({
    callSid: pstnSid,
    wssUrl: pstnWss,
    track: "inbound_track",
  });

  const now = new Date().toISOString();
  if (pstnResult.ok) {
    await upsertPhoneCallTranscriptStreams(supabase, sid, {
      pstn_stream_sid: pstnResult.streamSid ?? null,
      pstn_stream_started_at: now,
      pstn_call_sid_at_attempt: pstnSid,
      pstn_stream_last_error: null,
      pstn_stream_last_attempt_at: now,
    });
    console.log("[maybe-start-pstn-transcript] twilio_ok", {
      reason,
      pstnStreamSid: pstnResult.streamSid ?? null,
    });
    return { ok: true, pstnStreamSid: pstnResult.streamSid ?? null };
  }

  const errFull = pstnResult.error;
  await upsertPhoneCallTranscriptStreams(supabase, sid, {
    pstn_stream_last_error: errFull.slice(0, 4000),
    pstn_stream_last_attempt_at: now,
    pstn_call_sid_at_attempt: pstnSid,
  });
  console.warn("[maybe-start-pstn-transcript] twilio_error", {
    reason,
    pstnCallSid: pstnSid.slice(0, 12) + "…",
    error: errFull,
  });
  return { ok: false, error: errFull };
}
