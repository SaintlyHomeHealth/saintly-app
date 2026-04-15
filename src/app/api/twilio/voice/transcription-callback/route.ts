import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { appendLiveTranscriptChunkToPhoneCall } from "@/lib/phone/persist-live-transcript-chunk";
import type { LiveTranscriptSpeaker } from "@/lib/phone/live-transcript-entries";
import { parseVerifiedTwilioFormBody } from "@/lib/twilio/verify-form-post";

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
      return new NextResponse("", { status: 204 });
    }
  }

  const callSid = typeof p.CallSid === "string" && p.CallSid.startsWith("CA") ? p.CallSid.trim() : "";
  if (!callSid) {
    return new NextResponse("", { status: 204 });
  }

  let transcript = "";
  try {
    const raw = typeof p.TranscriptionData === "string" ? p.TranscriptionData.trim() : "";
    if (raw) {
      const data = JSON.parse(raw) as { transcript?: string };
      transcript = typeof data.transcript === "string" ? data.transcript.trim() : "";
    }
  } catch {
    return new NextResponse("", { status: 204 });
  }

  if (!transcript) {
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
