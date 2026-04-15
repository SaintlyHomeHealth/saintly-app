import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { mergeSoftphoneConferenceMetadata } from "@/lib/phone/merge-softphone-conference-metadata";
import { findPhoneCallRowByTwilioCallSid } from "@/lib/phone/phone-call-lookup-by-call-sid";
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
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const callSid = typeof body.callSid === "string" ? body.callSid.trim() : "";
  if (!callSid.startsWith("CA")) {
    return NextResponse.json({ error: "callSid required" }, { status: 400 });
  }

  const statusCallbackUrl = resolveTranscriptionStatusCallbackUrl();
  if (!statusCallbackUrl) {
    return NextResponse.json(
      {
        error:
          "Real-time transcription callback URL not set. Set TWILIO_PUBLIC_BASE_URL or TWILIO_WEBHOOK_BASE_URL to your public https:// origin so Twilio can POST transcription events.",
        code: "transcription_callback_not_configured",
      },
      { status: 503 }
    );
  }

  console.log(
    "[twilio_rt]",
    JSON.stringify({
      step: "twilio_rt_step_01_start_requested",
      route: "POST /api/workspace/phone/conference/start-transcript",
      call_sid: callSid,
      status_callback_url_host: (() => {
        try {
          return new URL(statusCallbackUrl).host;
        } catch {
          return null;
        }
      })(),
    })
  );

  if (body.pstnOnly === true) {
    const deferred = await maybeStartDeferredPstnTranscriptStream(supabaseAdmin, callSid, "api_post_pstn_only");
    if (deferred.skipped === "client_transcript_never_started") {
      return NextResponse.json(
        { ok: false, error: "client_transcript_not_started_yet", pstnOnly: true, deferred },
        { status: 400 }
      );
    }
    if (!deferred.ok && deferred.error) {
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

  const row = await findPhoneCallRowByTwilioCallSid(supabaseAdmin, callSid);
  if (!row) {
    console.warn(
      "[transcript-e2e]",
      JSON.stringify({
        phase: "start_transcript_phone_row_not_found",
        client_leg_call_sid: `${callSid.slice(0, 10)}…`,
      })
    );
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
    console.log(
      "[transcript-e2e]",
      JSON.stringify({
        phase: "start_transcript_skipped_client_transcription_already_started",
        outcome: "success_skip_duplicate",
        client_leg_call_sid: `${callSid.slice(0, 10)}…`,
        canonical_external_call_id: `${canonicalExternalId.slice(0, 10)}…`,
      })
    );
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

  console.log(
    "[enable-transcript-flow]",
    JSON.stringify({
      phase: "api_before_twilio_realtime_transcription_create",
      client_leg_call_sid: callSid,
      canonical_external_call_id_for_row: canonicalExternalId,
      pstn_call_sid_from_row: pstnCallSid,
      track,
      status_callback_url: statusCallbackUrl,
    })
  );

  const clientResult = await createRealtimeTranscription({
    callSid,
    track,
    statusCallbackUrl,
    name: rtName,
    partialResults: false,
  });

  if (!clientResult.ok) {
    console.error("[start-transcript] client_realtime_transcription_error", {
      clientCallSid: callSid,
      track,
      twilioErrorFull: clientResult.error,
    });
    console.log(
      "[twilio_rt]",
      JSON.stringify({
        step: "twilio_rt_step_02_start_failed",
        route: "POST /api/workspace/phone/conference/start-transcript",
        call_sid: callSid,
        track,
        error: clientResult.error.slice(0, 500),
      })
    );
    return NextResponse.json({ error: clientResult.error }, { status: 502 });
  }

  console.log(
    "[twilio_rt]",
    JSON.stringify({
      step: "twilio_rt_step_02_start_succeeded",
      route: "POST /api/workspace/phone/conference/start-transcript",
      call_sid: callSid,
      transcription_sid: clientResult.transcriptionSid,
      track,
      status_callback_url_host: (() => {
        try {
          return new URL(statusCallbackUrl).host;
        } catch {
          return null;
        }
      })(),
    })
  );
  console.log("[start-transcript] client_realtime_transcription_ok", {
    clientCallSid: callSid,
    transcriptionSid: clientResult.transcriptionSid,
    track,
  });
  console.log(
    "[transcript-e2e]",
    JSON.stringify({
      tag: "transcript-e2e",
      phase: "e2e_step_04_twilio_realtime_transcription_started",
      outcome: "success",
      client_leg_call_sid: callSid,
      canonical_transcript_external_id: canonicalExternalId,
      transcription_sid: clientResult.transcriptionSid,
      selected_track: track,
    })
  );

  await upsertPhoneCallTranscriptStreams(supabaseAdmin, callSid, {
    client_realtime_transcription_sid: clientResult.transcriptionSid,
    client_realtime_transcription_started_at: new Date().toISOString(),
  });

  const pstnDeferred =
    track === "inbound_track"
      ? await maybeStartDeferredPstnTranscriptStream(supabaseAdmin, callSid, "start_transcript_after_client_ok")
      : null;

  console.log("[start-transcript] summary", {
    clientCallSid: callSid,
    pstnCallSidFromRow: pstnCallSid,
    clientRealtimeTranscriptionStarted: true,
    clientRealtimeTranscriptionSid: clientResult.transcriptionSid,
    pstnDeferred,
  });

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

  return NextResponse.json({
    ok: true,
    transcriptionSid: clientResult.transcriptionSid,
    pstnRealtimeTranscriptionSid: pstnDeferred?.pstnRealtimeTranscriptionSid ?? null,
    pstnDeferred,
  });
}
