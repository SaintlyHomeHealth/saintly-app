import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { findPhoneCallRowByTwilioCallSid } from "@/lib/phone/phone-call-lookup-by-call-sid";
import { normalizeTwilioRecordingMediaUrl } from "@/lib/phone/twilio-recording-media";
import { schedulePstnBridgeDialRecordingWhisper } from "@/lib/phone/voicemail-saintly-process";
import { parseVerifiedTwilioFormBody } from "@/lib/twilio/verify-form-post";

export const runtime = "nodejs";

function asRecord(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object" && !Array.isArray(v)) return v as Record<string, unknown>;
  return {};
}

function parseRecordingDurationSeconds(value: string | undefined): number | null {
  if (value == null || value === "") return null;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Twilio `Dial` record callback (patient leg of outbound PSTN bridge). Persists recording metadata and queues Whisper.
 * Route: POST /api/twilio/voice/outbound-pstn-bridge/dial-recording
 */
export async function POST(req: NextRequest) {
  const parsed = await parseVerifiedTwilioFormBody(req);
  if (!parsed.ok) {
    return parsed.response;
  }

  const p = parsed.params;
  const callSid = p.CallSid?.trim() || "";
  const recordingSid = p.RecordingSid?.trim() || "";

  if (!callSid.startsWith("CA") || !recordingSid) {
    return new NextResponse("OK", { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const recordingUrlRaw = p.RecordingUrl?.trim() || null;
  const recordingUrl = recordingUrlRaw ? normalizeTwilioRecordingMediaUrl(recordingUrlRaw) : null;
  const recordingStatus = p.RecordingStatus?.trim() || null;
  const statusLower = (recordingStatus || "").toLowerCase();
  const isFinalOk = statusLower === "completed" || Boolean(recordingUrl);

  const row = await findPhoneCallRowByTwilioCallSid(supabaseAdmin, callSid);
  if (!row?.id) {
    console.warn(
      JSON.stringify({
        event: "transcript_failed",
        reason: "pstn_bridge_dial_recording_call_not_found",
        call_sid: `${callSid.slice(0, 10)}…`,
        recording_sid: `${recordingSid.slice(0, 8)}…`,
      })
    );
    return new NextResponse("OK", { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  const meta = asRecord(row.metadata);
  const voiceAi = asRecord(meta.voice_ai);
  const prevPbr = asRecord(voiceAi.pstn_bridge_dual_recording);
  const prevSid = typeof prevPbr.recording_sid === "string" ? prevPbr.recording_sid.trim() : "";

  const nextPbr: Record<string, unknown> = {
    ...prevPbr,
    recording_sid: recordingSid,
    recording_status: recordingStatus,
    recording_url: recordingUrl,
    recording_duration_seconds: parseRecordingDurationSeconds(p.RecordingDuration),
    received_at: new Date().toISOString(),
  };

  if (prevSid && prevSid !== recordingSid) {
    delete nextPbr.whisper_status;
    delete nextPbr.whisper_error;
    delete nextPbr.whisper_updated_at;
    delete nextPbr.whisper_model;
  }

  const { error: upErr } = await supabaseAdmin
    .from("phone_calls")
    .update({
      metadata: {
        ...meta,
        voice_ai: {
          ...voiceAi,
          pstn_bridge_dual_recording: nextPbr,
        },
      },
    })
    .eq("id", row.id);

  if (upErr) {
    console.warn("[outbound-pstn-bridge/dial-recording] update failed", upErr.message);
    return new NextResponse("OK", { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
  }

  console.log(
    JSON.stringify({
      tag: "outbound-pstn-bridge",
      event: "patient_leg_recording_callback",
      phone_call_id: row.id,
      call_sid: `${callSid.slice(0, 10)}…`,
      recording_status: recordingStatus,
      is_final_ok: isFinalOk,
      recording_replay: prevSid === recordingSid,
    })
  );

  if (isFinalOk) {
    schedulePstnBridgeDialRecordingWhisper(row.id);
  }

  return new NextResponse("OK", { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
