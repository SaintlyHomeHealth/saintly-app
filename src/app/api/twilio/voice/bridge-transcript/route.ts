import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { appendLiveTranscriptChunkToPhoneCall } from "@/lib/phone/persist-live-transcript-chunk";
import {
  normalizeSpeaker,
  type LiveTranscriptSpeaker,
} from "@/lib/phone/live-transcript-entries";
import { logTwilioVoiceTrace } from "@/lib/twilio/twilio-voice-trace-log";

/**
 * Incremental live transcript from the legacy Media Streams bridge (Railway).
 * Secured with REALTIME_BRIDGE_SHARED_SECRET (same header as realtime/result).
 *
 * Prefer Twilio native Real-Time Transcription → `/api/twilio/voice/transcription-callback`.
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

  const result = await appendLiveTranscriptChunkToPhoneCall(supabaseAdmin, {
    externalCallId,
    text,
    speaker,
  });

  if (!result.ok) {
    if (result.error === "call_not_found") {
      console.warn("[transcript] bridge_transcript_call_not_found", { external_call_id: externalCallId.slice(0, 12) });
      return NextResponse.json({ ok: false, error: "call_not_found" }, { status: 404 });
    }
    console.error("[bridge-transcript] update_failed", result.error);
    return NextResponse.json({ ok: false, error: result.error }, { status: 500 });
  }

  const { data: row } = await supabaseAdmin
    .from("phone_calls")
    .select("metadata")
    .eq("id", result.phoneCallId)
    .maybeSingle();
  const meta = row?.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata) ? row.metadata : {};
  const rowSource = typeof (meta as Record<string, unknown>).source === "string" ? String((meta as Record<string, unknown>).source).trim() : "";
  const workspaceSoftphoneRow = rowSource === "twilio_voice_softphone";

  if (speaker === "agent") {
    logTwilioVoiceTrace({
      route: "POST /api/twilio/voice/bridge-transcript",
      client_call_sid: externalCallId,
      pstn_call_sid: null,
      ai_path_entered: true,
      softphone_bypass_path_entered: false,
      twiml_summary: `stored_transcript_speaker=agent|seq=${result.seq}`,
      branch: workspaceSoftphoneRow
        ? "agent_line_on_softphone_phone_call_row_filter_in_ui"
        : "agent_line_inbound_receptionist_or_other",
    });
  }

  return NextResponse.json({ ok: true, seq: result.seq });
}
