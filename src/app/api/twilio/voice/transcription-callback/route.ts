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

  if (event === "transcription-started" || event === "transcription-stopped") {
    return new NextResponse("", { status: 204 });
  }

  if (event === "transcription-error") {
    console.warn("[transcript] transcription_callback_error", { event, callSid: p.CallSid ?? null });
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

  const result = await appendLiveTranscriptChunkToPhoneCall(supabaseAdmin, {
    externalCallId: callSid,
    text: transcript,
    speaker,
  });

  if (!result.ok) {
    console.warn("[transcript] chunk_persist_failed", { callSid: callSid.slice(0, 12), error: result.error });
  }

  return new NextResponse("", { status: 204 });
}
