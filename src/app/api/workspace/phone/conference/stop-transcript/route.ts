import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { findPhoneCallRowByTwilioCallSid } from "@/lib/phone/phone-call-lookup-by-call-sid";
import type { SoftphoneTranscriptStreamsMeta } from "@/lib/phone/softphone-transcript-stream-meta";
import { mergeSoftphoneTranscriptStreamsIntoVoiceAi } from "@/lib/phone/softphone-transcript-streams";
import { canAccessWorkspacePhone, getStaffProfile } from "@/lib/staff-profile";
import { stopRealtimeTranscription } from "@/lib/twilio/realtime-transcription-rest";

/**
 * Stops Twilio Real-Time Transcription on the client leg (and PSTN leg when present).
 * Route: POST /api/workspace/phone/conference/stop-transcript
 */
export async function POST(req: Request) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { callSid?: string };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const callSid = typeof body.callSid === "string" ? body.callSid.trim() : "";
  if (!callSid.startsWith("CA")) {
    return NextResponse.json({ error: "callSid required" }, { status: 400 });
  }

  const row = await findPhoneCallRowByTwilioCallSid(supabaseAdmin, callSid);
  if (!row?.id) {
    return NextResponse.json({ error: "phone_call not found" }, { status: 404 });
  }

  const meta =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};
  const voiceAi =
    meta.voice_ai && typeof meta.voice_ai === "object" && !Array.isArray(meta.voice_ai)
      ? (meta.voice_ai as Record<string, unknown>)
      : {};
  const streams = (voiceAi.softphone_transcript_streams ?? null) as SoftphoneTranscriptStreamsMeta | null;

  const now = new Date().toISOString();
  const patch: Partial<SoftphoneTranscriptStreamsMeta> = {
    client_realtime_transcription_stopped_at: now,
  };

  const stopped: string[] = [];
  const errors: string[] = [];

  if (streams?.client_realtime_transcription_sid) {
    const r = await stopRealtimeTranscription({
      callSid,
      transcriptionSidOrName: streams.client_realtime_transcription_sid,
    });
    if (r.ok) stopped.push("client");
    else errors.push(`client: ${r.error}`);
  }

  const pstnSid =
    meta.softphone_conference &&
    typeof meta.softphone_conference === "object" &&
    !Array.isArray(meta.softphone_conference) &&
    typeof (meta.softphone_conference as Record<string, unknown>).pstn_call_sid === "string"
      ? String((meta.softphone_conference as Record<string, unknown>).pstn_call_sid).trim()
      : "";

  if (pstnSid.startsWith("CA") && streams?.pstn_realtime_transcription_sid) {
    patch.pstn_realtime_transcription_stopped_at = now;
    const r = await stopRealtimeTranscription({
      callSid: pstnSid,
      transcriptionSidOrName: streams.pstn_realtime_transcription_sid,
    });
    if (r.ok) stopped.push("pstn");
    else errors.push(`pstn: ${r.error}`);
  }

  meta.voice_ai = mergeSoftphoneTranscriptStreamsIntoVoiceAi(voiceAi, patch);

  await supabaseAdmin.from("phone_calls").update({ metadata: meta }).eq("id", row.id);

  if (stopped.length === 0 && errors.length > 0) {
    return NextResponse.json({ ok: false, error: errors.join("; ") }, { status: 502 });
  }

  return NextResponse.json({ ok: true, stopped, errors: errors.length ? errors : undefined });
}
