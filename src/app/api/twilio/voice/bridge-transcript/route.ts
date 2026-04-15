import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import {
  normalizeSpeaker,
  parseLiveTranscriptEntriesFromMetadata,
  trimEntries,
  type LiveTranscriptEntry,
  type LiveTranscriptSpeaker,
} from "@/lib/phone/live-transcript-entries";
import { logTwilioVoiceTrace } from "@/lib/twilio/twilio-voice-trace-log";

/**
 * Incremental live transcript from the Railway Twilio↔OpenAI bridge (Media Streams).
 * Secured with REALTIME_BRIDGE_SHARED_SECRET (same header as realtime/result).
 *
 * Appends `metadata.voice_ai.live_transcript_entries` (seq, speaker, text, ts).
 * Keeps `live_transcript_excerpt` as a rolling concat for legacy readers (unclamped in DB).
 */
export async function POST(req: NextRequest) {
  const secret = process.env.REALTIME_BRIDGE_SHARED_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ ok: false, error: "not_configured" }, { status: 503 });
  }
  const headerSecret = req.headers.get("X-Realtime-Bridge-Secret")?.trim();
  if (headerSecret !== secret) {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let body: { external_call_id?: string; text?: string; speaker?: string };
  try {
    body = (await req.json()) as { external_call_id?: string; text?: string; speaker?: string };
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const externalCallId = typeof body.external_call_id === "string" ? body.external_call_id.trim() : "";
  const text = typeof body.text === "string" ? body.text.trim() : "";
  const speaker: LiveTranscriptSpeaker = normalizeSpeaker(body.speaker ?? "caller");

  if (!externalCallId.startsWith("CA") || !text) {
    return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
  }

  console.log(
    "[bridge-transcript] transcript_delta_received",
    JSON.stringify({
      tag: "transcript-e2e",
      phase: "bridge_transcript_delta_received",
      transcript_external_id_short: `${externalCallId.slice(0, 10)}…`,
      speaker_label_before_store: speaker,
      textLen: text.length,
    })
  );

  const { data: row, error: selErr } = await supabaseAdmin
    .from("phone_calls")
    .select("id, metadata")
    .or(`external_call_id.eq.${externalCallId},metadata->twilio_leg_map->>last_leg_call_sid.eq.${externalCallId}`)
    .limit(1)
    .maybeSingle();

  if (selErr || !row?.id) {
    console.warn(
      "[bridge-transcript] call_not_found",
      JSON.stringify({
        tag: "transcript-e2e",
        phase: "bridge_transcript_lookup_failed",
        external_call_id_short: externalCallId.slice(0, 10),
        reason: "no_row_matching_external_call_id_or_child_leg_map",
      })
    );
    return NextResponse.json({ ok: false, error: "call_not_found" }, { status: 404 });
  }

  const meta =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};
  const rowSource = typeof meta.source === "string" ? meta.source.trim() : "";
  const workspaceSoftphoneRow = rowSource === "twilio_voice_softphone";
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

  const entry: LiveTranscriptEntry = {
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

  const { error: upErr } = await supabaseAdmin.from("phone_calls").update({ metadata: meta }).eq("id", row.id);
  if (upErr) {
    console.error("[bridge-transcript] update_failed", upErr.message);
    return NextResponse.json({ ok: false, error: upErr.message }, { status: 500 });
  }

  console.log(
    "[bridge-transcript] transcript_chunk_written",
    JSON.stringify({
      tag: "transcript-e2e",
      phase: "transcript_chunk_persisted_to_phone_calls_metadata",
      phone_calls_id: row.id,
      transcript_external_id_short: `${externalCallId.slice(0, 10)}…`,
      seq: entry.seq,
      speaker_stored: speaker,
      entriesTotal: mergedEntries.length,
    })
  );

  if (speaker === "agent") {
    logTwilioVoiceTrace({
      route: "POST /api/twilio/voice/bridge-transcript",
      client_call_sid: externalCallId,
      pstn_call_sid: null,
      ai_path_entered: true,
      softphone_bypass_path_entered: false,
      twiml_summary: `stored_transcript_speaker=agent|seq=${entry.seq}`,
      branch: workspaceSoftphoneRow
        ? "agent_line_on_softphone_phone_call_row_filter_in_ui"
        : "agent_line_inbound_receptionist_or_other",
    });
  }

  return NextResponse.json({ ok: true, seq: entry.seq });
}
