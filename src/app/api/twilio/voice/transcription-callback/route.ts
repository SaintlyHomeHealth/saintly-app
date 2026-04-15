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
  const callSidRaw = typeof p.CallSid === "string" ? p.CallSid.trim() : "";

  console.log(
    "[twilio_rt]",
    JSON.stringify({
      step: "twilio_rt_step_03_callback_received",
      route: "POST /api/twilio/voice/transcription-callback",
      transcription_event: event || null,
      call_sid: callSidRaw.startsWith("CA") ? `${callSidRaw.slice(0, 10)}…` : null,
      transcription_sid: typeof p.TranscriptionSid === "string" ? p.TranscriptionSid : null,
      partial_results: p.PartialResults ?? null,
      final: p.Final ?? null,
      track: p.Track ?? null,
    })
  );

  if (event === "transcription-started" || event === "transcription-stopped") {
    console.log("[twilio-rt-transcription]", JSON.stringify({ phase: event, callSid: p.CallSid ?? null }));
    return new NextResponse("", { status: 204 });
  }

  if (event === "transcription-error") {
    console.warn("[twilio-rt-transcription] transcription-error", p);
    return new NextResponse("", { status: 204 });
  }

  if (event !== "transcription-content") {
    return new NextResponse("", { status: 204 });
  }

  if (p.PartialResults === "true") {
    const final = (p.Final ?? "").trim().toLowerCase();
    if (final === "false") {
      console.log(
        "[twilio_rt]",
        JSON.stringify({
          step: "twilio_rt_step_03b_skipped_partial_non_final",
          call_sid: callSidRaw.startsWith("CA") ? `${callSidRaw.slice(0, 10)}…` : null,
        })
      );
      return new NextResponse("", { status: 204 });
    }
  }

  const callSid = callSidRaw.startsWith("CA") ? callSidRaw : "";
  if (!callSid) {
    console.warn(
      "[twilio_rt]",
      JSON.stringify({ step: "twilio_rt_step_03c_missing_call_sid", transcription_event: event })
    );
    return new NextResponse("", { status: 204 });
  }

  const rawTd = typeof p.TranscriptionData === "string" ? p.TranscriptionData : "";
  let transcript = extractTranscriptFromTranscriptionDataJson(rawTd);

  if (!transcript) {
    const preview = rawTd.length > 220 ? `${rawTd.slice(0, 220)}…` : rawTd;
    console.warn(
      "[twilio_rt]",
      JSON.stringify({
        step: "twilio_rt_step_03d_transcription_data_unparsed",
        call_sid: `${callSid.slice(0, 10)}…`,
        transcription_data_preview: preview,
      })
    );
    return new NextResponse("", { status: 204 });
  }

  const track = (p.Track ?? "").trim().toLowerCase();
  /** WebRTC/PSTN: inbound = toward Twilio (e.g. mic); outbound = from Twilio to caller earpiece. */
  let speaker: LiveTranscriptSpeaker = "unknown";
  if (track === "inbound_track") speaker = "staff";
  else if (track === "outbound_track") speaker = "caller";
  else speaker = "unknown";

  const result = await appendLiveTranscriptChunkToPhoneCall(supabaseAdmin, {
    externalCallId: callSid,
    text: transcript,
    speaker,
  });

  if (!result.ok) {
    console.warn("[twilio-rt-transcription] persist_failed", { callSid: callSid.slice(0, 12), error: result.error });
    return new NextResponse("", { status: 204 });
  }

  console.log(
    "[twilio-rt-transcription] chunk_persisted",
    JSON.stringify({
      callSid: `${callSid.slice(0, 10)}…`,
      seq: result.seq,
      speaker,
      textLen: transcript.length,
    })
  );

  return new NextResponse("", { status: 204 });
}
