import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { appendLiveTranscriptChunkToPhoneCall } from "@/lib/phone/persist-live-transcript-chunk";
import type { LiveTranscriptSpeaker } from "@/lib/phone/live-transcript-entries";
import { parseVerifiedTwilioFormBody } from "@/lib/twilio/verify-form-post";

/** Route: POST /api/twilio/voice/transcription-callback */
export const runtime = "nodejs";

function extractTranscriptFromTranscriptionDataJson(raw: string): string {
  const t = raw.trim();
  if (!t) return "";
  try {
    const data = JSON.parse(t) as Record<string, unknown> | string;
    if (typeof data === "string") return data.trim();
    const a =
      (typeof data.transcript === "string" ? data.transcript : "") ||
      (typeof data.Transcript === "string" ? data.Transcript : "");
    return typeof a === "string" ? a.trim() : "";
  } catch {
    return "";
  }
}

/**
 * Twilio Real-Time Transcription status callback.
 * Events: transcription-started | transcription-content | transcription-stopped | transcription-error
 * @see https://www.twilio.com/docs/voice/twiml/transcription#statuscallbackurl
 */
export async function POST(req: NextRequest) {
  const parsed = await parseVerifiedTwilioFormBody(req);

  if (!parsed.ok) {
    return parsed.response;
  }

  const p = parsed.params;
  const event = (p.TranscriptionEvent ?? "").trim();
  const callSidForLog =
    typeof p.CallSid === "string" && p.CallSid.trim().startsWith("CA") ? `${p.CallSid.trim().slice(0, 10)}…` : null;

  if (event === "transcription-started") {
    console.log(
      JSON.stringify({
        event: "transcript_started",
        source: "twilio_transcription_callback",
        transcription_event: event,
        call_sid: callSidForLog,
        transcription_sid: (p.TranscriptionSid ?? "").trim().slice(0, 12) || null,
      })
    );
    return new NextResponse("", { status: 204 });
  }

  if (event === "transcription-stopped") {
    console.log(
      JSON.stringify({
        event: "transcript_completed",
        source: "twilio_transcription_callback",
        transcription_event: event,
        call_sid: callSidForLog,
        transcription_sid: (p.TranscriptionSid ?? "").trim().slice(0, 12) || null,
      })
    );
    return new NextResponse("", { status: 204 });
  }

  if (event === "transcription-error") {
    console.warn(
      JSON.stringify({
        event: "transcript_failed",
        source: "twilio_transcription_callback",
        transcription_event: event,
        call_sid: callSidForLog,
        error_code: (p.ErrorCode ?? "").trim() || null,
        error_message: (p.ErrorMessage ?? p.TranscriptionError ?? "").trim().slice(0, 500) || null,
      })
    );
    return new NextResponse("", { status: 204 });
  }

  if (event !== "transcription-content") {
    return new NextResponse("", { status: 204 });
  }

  if (p.PartialResults === "true") {
    const final = (p.Final ?? "").trim().toLowerCase();
    if (final === "false") {
      return new NextResponse("", { status: 204 });
    }
  }

  const callSidRaw = typeof p.CallSid === "string" ? p.CallSid.trim() : "";
  const callSid = callSidRaw.startsWith("CA") ? callSidRaw : "";
  if (!callSid) {
    return new NextResponse("", { status: 204 });
  }

  const rawTd = typeof p.TranscriptionData === "string" ? p.TranscriptionData : "";
  const transcript = extractTranscriptFromTranscriptionDataJson(rawTd);

  if (!transcript) {
    console.warn("[transcript] transcription_data_unparsed", {
      call_sid: `${callSid.slice(0, 10)}…`,
      preview: rawTd.length > 120 ? `${rawTd.slice(0, 120)}…` : rawTd,
    });
    return new NextResponse("", { status: 204 });
  }

  const track = (p.Track ?? "").trim().toLowerCase();
  let speaker: LiveTranscriptSpeaker = "unknown";
  if (track === "inbound_track") speaker = "staff";
  else if (track === "outbound_track") speaker = "caller";

  const isFinal =
    (p.PartialResults ?? "").trim() !== "true" || (p.Final ?? "").trim().toLowerCase() === "true";

  console.log(
    JSON.stringify({
      event: "transcript_partial",
      source: "twilio_transcription_callback",
      call_sid: `${callSid.slice(0, 10)}…`,
      track: track || null,
      speaker,
      is_final: isFinal,
      text_len: transcript.length,
      text_preview: transcript.length > 96 ? `${transcript.slice(0, 96)}…` : transcript,
    })
  );

  const result = await appendLiveTranscriptChunkToPhoneCall(supabaseAdmin, {
    externalCallId: callSid,
    text: transcript,
    speaker,
  });

  if (!result.ok) {
    console.warn(
      JSON.stringify({
        event: "transcript_failed",
        source: "twilio_transcription_callback",
        reason: "chunk_persist_failed",
        call_sid: `${callSid.slice(0, 10)}…`,
        error: result.error,
      })
    );
  }

  return new NextResponse("", { status: 204 });
}
