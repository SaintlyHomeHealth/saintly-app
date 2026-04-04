import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { applyTwilioVoicemailTranscription } from "@/lib/phone/log-call";
import { parseVerifiedTwilioFormBody } from "@/lib/twilio/verify-form-post";

/**
 * Twilio Record transcribeCallback — stores text in phone_calls.metadata.voicemail_transcription.
 */
export async function POST(req: NextRequest) {
  const parsed = await parseVerifiedTwilioFormBody(req);
  if (!parsed.ok) {
    return parsed.response;
  }

  const p = parsed.params;
  const recordingSid = (p.RecordingSid ?? p.recordingSid ?? "").trim();
  const transcriptionText =
    typeof p.TranscriptionText === "string"
      ? p.TranscriptionText
      : typeof p.transcriptionText === "string"
        ? p.transcriptionText
        : "";
  const transcriptionStatus =
    typeof p.TranscriptionStatus === "string"
      ? p.TranscriptionStatus
      : typeof p.transcriptionStatus === "string"
        ? p.transcriptionStatus
        : null;
  const callSid = (p.CallSid ?? p.callSid ?? "").trim() || null;

  const result = await applyTwilioVoicemailTranscription(supabaseAdmin, {
    recordingSid,
    transcriptionText: transcriptionText || null,
    transcriptionStatus,
    callSid,
    raw: p,
  });

  if (!result.ok) {
    console.warn("[twilio/voice/voicemail-transcription]", result.error);
  }

  return new NextResponse("OK", { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
