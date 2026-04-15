import type { SupabaseClient } from "@supabase/supabase-js";

import {
  normalizeSpeaker,
  parseLiveTranscriptEntriesFromMetadata,
  trimEntries,
  type LiveTranscriptSpeaker,
} from "@/lib/phone/live-transcript-entries";
import { findPhoneCallRowByTwilioCallSid } from "@/lib/phone/phone-call-lookup-by-call-sid";

/**
 * Append one live transcript line to `phone_calls.metadata.voice_ai` (entries + excerpt + seq).
 * Used by Twilio Real-Time Transcription webhooks and (legacy) the Media Streams bridge.
 */
export async function appendLiveTranscriptChunkToPhoneCall(
  supabase: SupabaseClient,
  input: {
    externalCallId: string;
    text: string;
    speaker: LiveTranscriptSpeaker;
  }
): Promise<{ ok: true; phoneCallId: string; seq: number } | { ok: false; error: string }> {
  const externalCallId = input.externalCallId.trim();
  const text = input.text.trim();
  const speaker = normalizeSpeaker(input.speaker);

  if (!externalCallId.startsWith("CA") || !text) {
    return { ok: false, error: "missing_fields" };
  }

  const row = await findPhoneCallRowByTwilioCallSid(supabase, externalCallId);

  if (!row?.id) {
    console.warn("[transcript] persist_chunk_call_not_found", {
      external_call_id: `${externalCallId.slice(0, 10)}…`,
    });
    return { ok: false, error: "call_not_found" };
  }

  const meta =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};
  const prevVoice =
    meta.voice_ai && typeof meta.voice_ai === "object" && !Array.isArray(meta.voice_ai)
      ? (meta.voice_ai as Record<string, unknown>)
      : {};

  const prevEntries = parseLiveTranscriptEntriesFromMetadata(prevVoice);
  const maxFromEntries = prevEntries.length > 0 ? Math.max(...prevEntries.map((e) => e.seq)) : 0;
  const storedNext =
    typeof prevVoice.live_transcript_next_seq === "number" && Number.isFinite(prevVoice.live_transcript_next_seq)
      ? prevVoice.live_transcript_next_seq
      : 1;
  const nextSeq = Math.max(storedNext, maxFromEntries + 1);

  const entry = {
    seq: nextSeq,
    speaker,
    text: text.slice(0, 12_000),
    ts: new Date().toISOString(),
  };
  const mergedEntries = trimEntries([...prevEntries, entry]);

  const prevTx = typeof prevVoice.live_transcript_excerpt === "string" ? prevVoice.live_transcript_excerpt.trim() : "";
  const nextTx = prevTx ? `${prevTx}\n${text}` : text;
  const clippedExcerpt = nextTx.length > 100_000 ? nextTx.slice(-100_000) : nextTx;

  meta.voice_ai = {
    ...prevVoice,
    live_transcript_entries: mergedEntries,
    live_transcript_next_seq: nextSeq + 1,
    live_transcript_excerpt: clippedExcerpt,
    source: typeof prevVoice.source === "string" ? prevVoice.source : "live_receptionist",
  };

  const { error: upErr } = await supabase.from("phone_calls").update({ metadata: meta }).eq("id", row.id);
  if (upErr) {
    console.warn("[transcript] persist_chunk_update_failed", { phone_call_id: row.id, error: upErr.message });
    return { ok: false, error: upErr.message };
  }

  return { ok: true, phoneCallId: row.id, seq: entry.seq };
}
