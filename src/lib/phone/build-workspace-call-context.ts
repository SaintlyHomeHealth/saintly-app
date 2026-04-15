import type { SupabaseClient } from "@supabase/supabase-js";

import { readVoiceAiMetadataFromMetadata } from "@/app/admin/phone/_lib/voice-ai-metadata";
import { computeConferenceGating, type ConferenceGatingSnapshot } from "@/lib/phone/conference-gating";
import {
  parseLiveTranscriptEntriesFromMetadata,
  readUnclampedLiveTranscriptExcerpt,
  type LiveTranscriptEntry,
} from "@/lib/phone/live-transcript-entries";
import type { SoftphoneTranscriptStreamsMeta } from "@/lib/phone/softphone-transcript-stream-meta";
import {
  defaultSoftphoneRecordingMeta,
  type SoftphoneRecordingMeta,
} from "@/lib/twilio/softphone-recording-types";

export type WorkspaceCallContextPayload = {
  phone_call_id: string;
  /** `phone_calls.metadata.source` when set (e.g. `twilio_voice_softphone`). */
  metadata_source: string | null;
  /**
   * True when this row is a staff workspace softphone session (`metadata.source=twilio_voice_softphone`).
   * Used to keep live transcript UI to You/Caller only (no AI lines in the main thread).
   */
  workspace_softphone_session: boolean;
  from_e164: string | null;
  external_call_id: string;
  softphone_conference: {
    conference_sid: string | null;
    pstn_call_sid: string | null;
    pstn_on_hold: boolean | null;
    mode: string | null;
  } | null;
  softphone_recording: SoftphoneRecordingMeta | null;
  voice_ai: {
    short_summary: string | null;
    urgency: string | null;
    route_target: string | null;
    caller_category: string | null;
    /** Legacy rolling text; prefer `live_transcript_entries` for UI. Unclamped for workspace. */
    live_transcript_excerpt: string | null;
    /** Incremental live lines from Media Stream bridge (append-only). */
    live_transcript_entries: LiveTranscriptEntry[] | null;
    recommended_action: string | null;
    confidence_summary: string | null;
    /** Client + PSTN transcript stream bookkeeping (for deferred PSTN start). */
    softphone_transcript_streams: SoftphoneTranscriptStreamsMeta | null;
    /** Server auto-started inbound PSTN transcript (see `maybeStartInboundTranscriptStreamIfEligible`). */
    inbound_transcript_stream_started_at: string | null;
    inbound_transcript_mode: string | null;
  } | null;
  conference_gating: ConferenceGatingSnapshot;
};

/**
 * Shared payload for `/api/workspace/phone/call-context` and `/api/workspace/phone/conference/diagnostics`.
 */
export async function buildWorkspaceCallContextPayload(
  supabase: SupabaseClient,
  callSid: string
): Promise<{ found: false } | { found: true; payload: WorkspaceCallContextPayload }> {
  const selectCols = "id, from_e164, external_call_id, metadata, started_at";

  const { data: byExternalId, error: errExt } = await supabase
    .from("phone_calls")
    .select(selectCols)
    .eq("external_call_id", callSid)
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  let data = byExternalId;
  let error = errExt;

  if (error || !data) {
    const { data: byChildLeg, error: errLeg } = await supabase
      .from("phone_calls")
      .select(selectCols)
      .filter("metadata->twilio_leg_map->>last_leg_call_sid", "eq", callSid)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    data = byChildLeg;
    error = errLeg;
  }

  if (error || !data) {
    return { found: false };
  }

  const meta = data.metadata;
  const rawMeta =
    meta && typeof meta === "object" && !Array.isArray(meta) ? (meta as Record<string, unknown>) : null;
  const metadataSource =
    rawMeta && typeof rawMeta.source === "string" && rawMeta.source.trim() !== ""
      ? rawMeta.source.trim()
      : null;
  const workspaceSoftphoneSession = metadataSource === "twilio_voice_softphone";
  const voiceAi = readVoiceAiMetadataFromMetadata(meta);
  const rawVoiceAi =
    meta && typeof meta === "object" && !Array.isArray(meta)
      ? (meta as Record<string, unknown>).voice_ai
      : null;
  const liveEntries =
    rawVoiceAi && typeof rawVoiceAi === "object" && !Array.isArray(rawVoiceAi)
      ? parseLiveTranscriptEntriesFromMetadata(rawVoiceAi)
      : [];
  const excerptUnclamped =
    rawVoiceAi && typeof rawVoiceAi === "object" && !Array.isArray(rawVoiceAi)
      ? readUnclampedLiveTranscriptExcerpt(rawVoiceAi)
      : null;
  const transcriptStreamsRaw =
    rawVoiceAi && typeof rawVoiceAi === "object" && !Array.isArray(rawVoiceAi)
      ? (rawVoiceAi as Record<string, unknown>).softphone_transcript_streams
      : null;
  const inboundTranscriptStartedAt =
    rawVoiceAi && typeof rawVoiceAi === "object" && !Array.isArray(rawVoiceAi)
      ? (rawVoiceAi as Record<string, unknown>).inbound_transcript_stream_started_at
      : null;
  const inboundTranscriptMode =
    rawVoiceAi && typeof rawVoiceAi === "object" && !Array.isArray(rawVoiceAi)
      ? (rawVoiceAi as Record<string, unknown>).inbound_transcript_mode
      : null;
  const softphoneTranscriptStreams: SoftphoneTranscriptStreamsMeta | null =
    transcriptStreamsRaw && typeof transcriptStreamsRaw === "object" && !Array.isArray(transcriptStreamsRaw)
      ? (transcriptStreamsRaw as SoftphoneTranscriptStreamsMeta)
      : null;
  const sc =
    meta && typeof meta === "object" && !Array.isArray(meta)
      ? (meta as Record<string, unknown>).softphone_conference
      : null;
  const conf =
    sc && typeof sc === "object" && !Array.isArray(sc)
      ? (sc as Record<string, unknown>)
      : null;

  const softphoneConference = conf
    ? {
        mode: typeof conf.mode === "string" ? conf.mode : null,
        conference_sid: typeof conf.conference_sid === "string" ? conf.conference_sid : null,
        pstn_call_sid: typeof conf.pstn_call_sid === "string" ? conf.pstn_call_sid : null,
      }
    : null;

  const srRaw =
    meta && typeof meta === "object" && !Array.isArray(meta)
      ? (meta as Record<string, unknown>).softphone_recording
      : null;
  let softphoneRecording: SoftphoneRecordingMeta | null = null;
  if (srRaw && typeof srRaw === "object" && !Array.isArray(srRaw)) {
    const sr = srRaw as Record<string, unknown>;
    const status =
      sr.status === "in-progress" || sr.status === "stopped" || sr.status === "failed" || sr.status === "idle"
        ? sr.status
        : "idle";
    const source =
      sr.source === "conference" || sr.source === "pstn_leg" || sr.source === "client_leg" ? sr.source : null;
    softphoneRecording = {
      recording_sid: typeof sr.recording_sid === "string" ? sr.recording_sid : null,
      source,
      status,
      started_at: typeof sr.started_at === "string" ? sr.started_at : null,
      stopped_at: typeof sr.stopped_at === "string" ? sr.stopped_at : null,
      last_error_message: typeof sr.last_error_message === "string" ? sr.last_error_message : null,
    };
  }

  const gating = computeConferenceGating({
    clientCallSid: typeof data.external_call_id === "string" ? data.external_call_id : callSid,
    softphoneConference: softphoneConference,
  });

  const payload: WorkspaceCallContextPayload = {
    phone_call_id: data.id as string,
    metadata_source: metadataSource,
    workspace_softphone_session: workspaceSoftphoneSession,
    from_e164: typeof data.from_e164 === "string" ? data.from_e164 : null,
    external_call_id: typeof data.external_call_id === "string" ? data.external_call_id : callSid,
    softphone_conference: conf
      ? {
          conference_sid: typeof conf.conference_sid === "string" ? conf.conference_sid : null,
          pstn_call_sid: typeof conf.pstn_call_sid === "string" ? conf.pstn_call_sid : null,
          pstn_on_hold: typeof conf.pstn_on_hold === "boolean" ? conf.pstn_on_hold : null,
          mode: typeof conf.mode === "string" ? conf.mode : null,
        }
      : null,
    softphone_recording: softphoneRecording ?? defaultSoftphoneRecordingMeta(),
    voice_ai:
      voiceAi ||
      liveEntries.length > 0 ||
      excerptUnclamped ||
      softphoneTranscriptStreams ||
      typeof inboundTranscriptStartedAt === "string"
        ? {
            short_summary: voiceAi?.short_summary || null,
            urgency: voiceAi?.urgency || null,
            route_target: voiceAi?.route_target || null,
            caller_category: voiceAi?.caller_category || null,
            live_transcript_excerpt: excerptUnclamped ?? voiceAi?.live_transcript_excerpt ?? null,
            live_transcript_entries: liveEntries.length > 0 ? liveEntries : null,
            recommended_action: voiceAi?.recommended_action || null,
            confidence_summary: voiceAi?.confidence_summary || null,
            softphone_transcript_streams: softphoneTranscriptStreams,
            inbound_transcript_stream_started_at:
              typeof inboundTranscriptStartedAt === "string" ? inboundTranscriptStartedAt : null,
            inbound_transcript_mode: typeof inboundTranscriptMode === "string" ? inboundTranscriptMode : null,
          }
        : null,
    conference_gating: gating,
  };

  return { found: true, payload };
}
