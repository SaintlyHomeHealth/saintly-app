import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { applyTwilioVoicemailRecording } from "@/lib/phone/log-call";
import { parseVerifiedTwilioFormBody } from "@/lib/twilio/verify-form-post";

function parseRecordingDurationSeconds(value: string | undefined): number | null {
  if (value == null || value === "") return null;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Twilio <Record recordingStatusCallback> target. Resolves parent inbound CallSid like /voice/status.
 */
export async function POST(req: NextRequest) {
  const parsed = await parseVerifiedTwilioFormBody(req);
  if (!parsed.ok) {
    return parsed.response;
  }

  const p = parsed.params;
  const parentCallSid = p.ParentCallSid?.trim() || "";
  const callSid = p.CallSid?.trim() || "";
  const externalCallId = parentCallSid || callSid;
  const recordingSid = p.RecordingSid?.trim();
  const recordingUrl = p.RecordingUrl?.trim() || null;
  const recordingDurationSeconds = parseRecordingDurationSeconds(p.RecordingDuration);
  const recordingStatus = p.RecordingStatus?.trim() || null;

  if (!externalCallId || !recordingSid) {
    return new NextResponse("OK", { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const result = await applyTwilioVoicemailRecording(supabaseAdmin, {
    externalCallId,
    parentCallSid: parentCallSid || null,
    callSid: callSid || null,
    recordingSid,
    recordingUrl,
    recordingDurationSeconds,
    recordingStatus,
    from: p.From?.trim() ?? null,
    to: p.To?.trim() ?? null,
    raw: p,
  });

  if (!result.ok) {
    console.warn("[twilio/voice/recording]", result.error);
  }

  return new NextResponse("OK", { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
