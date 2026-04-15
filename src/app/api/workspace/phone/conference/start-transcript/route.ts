import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { mergeSoftphoneConferenceMetadata } from "@/lib/phone/merge-softphone-conference-metadata";
import { findPhoneCallRowByTwilioCallSidDetailed } from "@/lib/phone/phone-call-lookup-by-call-sid";
import {
  maybeStartDeferredPstnTranscriptStream,
  upsertPhoneCallTranscriptStreams,
} from "@/lib/phone/softphone-transcript-streams";
import { canAccessWorkspacePhone, getStaffProfile } from "@/lib/staff-profile";
import { createRealtimeTranscription } from "@/lib/twilio/realtime-transcription-rest";
import { resolveTranscriptionStatusCallbackUrl } from "@/lib/twilio/resolve-transcription-callback-url";
import { logTwilioVoiceTrace } from "@/lib/twilio/twilio-voice-trace-log";

/**
 * Starts Twilio **native** Real-Time Transcription on the Client leg (and PSTN when linked).
 * Callback: `POST /api/twilio/voice/transcription-callback` (requires TWILIO_PUBLIC_BASE_URL or TWILIO_WEBHOOK_BASE_URL).
 */
export async function POST(req: Request) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff)) {
    console.warn("[transcript] start_transcript", { outcome: "unauthorized" });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    callSid?: string;
    track?: "inbound_track" | "outbound_track" | "both_tracks";
    pstnOnly?: boolean;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    console.warn("[transcript] start_transcript", { outcome: "invalid_json" });
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const callSid = typeof body.callSid === "string" ? body.callSid.trim() : "";
  if (!callSid.startsWith("CA")) {
    console.warn("[transcript] start_transcript", { outcome: "invalid_call_sid" });
    return NextResponse.json({ error: "callSid required" }, { status: 400 });
  }

  const statusCallbackUrl = resolveTranscriptionStatusCallbackUrl();
  if (!statusCallbackUrl) {
    console.warn("[transcript] start_transcript", { outcome: "callback_url_not_configured" });
    return NextResponse.json(
      {
        error:
          "Real-time transcription callback URL not set. Set TWILIO_PUBLIC_BASE_URL or TWILIO_WEBHOOK_BASE_URL to your public https:// origin so Twilio can POST transcription events.",
        code: "transcription_callback_not_configured",
      },
      { status: 503 }
    );
  }

  if (body.pstnOnly === true) {
    const deferred = await maybeStartDeferredPstnTranscriptStream(supabaseAdmin, callSid, "api_post_pstn_only");
    if (deferred.skipped === "client_transcript_never_started") {
      console.warn("[transcript] start_transcript_pstn_only", { outcome: "client_transcript_not_started_yet" });
      return NextResponse.json(
        { ok: false, error: "client_transcript_not_started_yet", pstnOnly: true, deferred },
        { status: 400 }
      );
    }
    if (!deferred.ok && deferred.error) {
      console.warn("[transcript] start_transcript_pstn_only", { outcome: "deferred_failed", error: deferred.error });
      return NextResponse.json({ ok: false, error: deferred.error, pstnOnly: true, deferred }, { status: 502 });
    }
    logTwilioVoiceTrace({
      route: "POST /api/workspace/phone/conference/start-transcript",
      client_call_sid: callSid,
      pstn_call_sid: null,
      ai_path_entered: false,
      softphone_bypass_path_entered: true,
      twiml_summary: "realtime_transcription|pstn_only_deferred",
      branch: "pstn_transcript_stream_followup",
    });
    return NextResponse.json({
      ok: true,
      pstnOnly: true,
      pstnRealtimeTranscriptionSid: deferred.pstnRealtimeTranscriptionSid ?? null,
      skipped: deferred.skipped ?? null,
      error: deferred.error ?? null,
    });
  }

  const lookup = await findPhoneCallRowByTwilioCallSidDetailed(supabaseAdmin, callSid, { logLookup: false });
  const row = lookup.row;
  if (!row) {
    console.warn("[transcript] start_transcript", {
      outcome: "phone_call_not_found",
      lookup_path: lookup.lookup_path,
      call_sid: `${callSid.slice(0, 10)}…`,
    });
    return NextResponse.json(
      { error: "phone_call not found for this CallSid (parent or child leg)" },
      { status: 404 }
    );
  }

  const canonicalExternalId = row.external_call_id;
  const meta = row.metadata;
  const rawVoiceAi =
    meta.voice_ai && typeof meta.voice_ai === "object" && !Array.isArray(meta.voice_ai)
      ? (meta.voice_ai as Record<string, unknown>)
      : {};
  const metadataSource = typeof meta.source === "string" ? meta.source.trim() : "";

  const streamsEarly =
    rawVoiceAi.softphone_transcript_streams &&
    typeof rawVoiceAi.softphone_transcript_streams === "object" &&
    !Array.isArray(rawVoiceAi.softphone_transcript_streams)
      ? (rawVoiceAi.softphone_transcript_streams as Record<string, unknown>)
      : {};
  const clientLegTranscriptAlreadyStarted =
    typeof streamsEarly.client_realtime_transcription_started_at === "string" ||
    typeof streamsEarly.client_stream_started_at === "string";

  if (clientLegTranscriptAlreadyStarted) {
    return NextResponse.json({ ok: true, skipped: "client_transcript_already_started" });
  }

  const sc =
    meta.softphone_conference && typeof meta.softphone_conference === "object" && !Array.isArray(meta.softphone_conference)
      ? (meta.softphone_conference as Record<string, unknown>)
      : {};
  const pstnCallSid =
    typeof sc.pstn_call_sid === "string" && sc.pstn_call_sid.startsWith("CA") ? sc.pstn_call_sid.trim() : null;

  const hasConferencePstn = Boolean(pstnCallSid);
  const track =
    body.track ??
    (hasConferencePstn && metadataSource === "twilio_voice_softphone" ? "inbound_track" : "both_tracks");

  const rtName = `saintly-rt-client-${callSid.slice(-12)}`;

  const clientResult = await createRealtimeTranscription({
    callSid,
    track,
    statusCallbackUrl,
    name: rtName,
    partialResults: false,
  });

  if (!clientResult.ok) {
    console.error("[transcript] twilio_create_transcription_failed", {
      clientCallSid: callSid,
      track,
      error: clientResult.error,
    });
    return NextResponse.json({ error: clientResult.error }, { status: 502 });
  }

  await upsertPhoneCallTranscriptStreams(supabaseAdmin, callSid, {
    client_realtime_transcription_sid: clientResult.transcriptionSid,
    client_realtime_transcription_started_at: new Date().toISOString(),
  });

  const pstnDeferred =
    track === "inbound_track"
      ? await maybeStartDeferredPstnTranscriptStream(supabaseAdmin, callSid, "start_transcript_after_client_ok")
      : null;

  logTwilioVoiceTrace({
    route: "POST /api/workspace/phone/conference/start-transcript",
    client_call_sid: callSid,
    pstn_call_sid: pstnCallSid,
    ai_path_entered: false,
    softphone_bypass_path_entered: true,
    twiml_summary: `realtime_transcription|track=${track}`,
    branch: "staff_requested_live_transcription",
  });

  await mergeSoftphoneConferenceMetadata(supabaseAdmin, callSid, {
    last_conference_event: "realtime_transcription_started",
  });

  console.warn("[transcript] realtime_transcription_started", {
    call_sid: `${callSid.slice(0, 10)}…`,
    canonical_external_id: `${canonicalExternalId.slice(0, 10)}…`,
    transcription_sid: `${clientResult.transcriptionSid.slice(0, 8)}…`,
    track,
  });

  return NextResponse.json({
    ok: true,
    transcriptionSid: clientResult.transcriptionSid,
    pstnRealtimeTranscriptionSid: pstnDeferred?.pstnRealtimeTranscriptionSid ?? null,
    pstnDeferred,
  });
}
