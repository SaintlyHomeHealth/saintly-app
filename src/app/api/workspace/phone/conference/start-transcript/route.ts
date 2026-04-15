import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { mergeSoftphoneConferenceMetadata } from "@/lib/phone/merge-softphone-conference-metadata";
import { findPhoneCallRowByTwilioCallSid } from "@/lib/phone/phone-call-lookup-by-call-sid";
import {
  maybeStartDeferredPstnTranscriptStream,
  upsertPhoneCallTranscriptStreams,
} from "@/lib/phone/softphone-transcript-streams";
import { canAccessWorkspacePhone, getStaffProfile } from "@/lib/staff-profile";
import {
  appendSoftphoneTranscriptStreamParams,
  resolveTwilioMediaStreamWssUrl,
} from "@/lib/twilio/resolve-media-stream-wss-url";
import { startCallMediaStream } from "@/lib/twilio/start-call-media-stream";
import { logTwilioVoiceTrace } from "@/lib/twilio/twilio-voice-trace-log";

/**
 * Starts Twilio Media Streams on the Client leg (and PSTN when linked). WSS URL from
 * `TWILIO_SOFTPHONE_MEDIA_STREAM_WSS_URL` or `TWILIO_REALTIME_MEDIA_STREAM_WSS_URL` (full URL with path).
 * No marketplace plugins.
 */
export async function POST(req: Request) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: {
    callSid?: string;
    track?: "inbound_track" | "outbound_track" | "both_tracks";
    /** Only start the deferred PSTN inbound stream (after pstn_call_sid linked). */
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

  const baseWss = resolveTwilioMediaStreamWssUrl();
  if (!baseWss || !baseWss.startsWith("wss://")) {
    return NextResponse.json(
      {
        error:
          "Media stream WSS URL not set. Set TWILIO_SOFTPHONE_MEDIA_STREAM_WSS_URL or TWILIO_REALTIME_MEDIA_STREAM_WSS_URL to the full wss://host/path (e.g. …/twilio/realtime-stream).",
        code: "media_stream_not_configured",
      },
      { status: 503 }
    );
  }

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
      twiml_summary: "rest_start_media_stream|pstn_only_deferred",
      branch: "pstn_transcript_stream_followup",
    });
    return NextResponse.json({
      ok: true,
      pstnOnly: true,
      pstnStreamSid: deferred.pstnStreamSid ?? null,
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

  if (body.pstnOnly !== true && typeof rawVoiceAi.inbound_transcript_stream_started_at === "string") {
    console.log(
      "[transcript-e2e]",
      JSON.stringify({
        phase: "start_transcript_skipped_inbound_server_stream_already_started",
        client_leg_call_sid: `${callSid.slice(0, 10)}…`,
        canonical_external_call_id: `${canonicalExternalId.slice(0, 10)}…`,
        manual_enable_path: false,
      })
    );
    return NextResponse.json({ ok: true, skipped: "inbound_transcript_already_started" });
  }

  const sc =
    meta.softphone_conference && typeof meta.softphone_conference === "object" && !Array.isArray(meta.softphone_conference)
      ? (meta.softphone_conference as Record<string, unknown>)
      : {};
  const pstnCallSid =
    typeof sc.pstn_call_sid === "string" && sc.pstn_call_sid.startsWith("CA") ? sc.pstn_call_sid.trim() : null;

  const hasConferencePstn = Boolean(pstnCallSid);
  /** Conference+PSTN softphone: mic on client + separate PSTN stream. Inbound PSTN→browser (no PSTN leg on row): both sides on Client leg. */
  const track =
    body.track ??
    (hasConferencePstn && metadataSource === "twilio_voice_softphone" ? "inbound_track" : "both_tracks");

  const clientWss = appendSoftphoneTranscriptStreamParams(baseWss, {
    transcriptExternalId: canonicalExternalId,
    inputRole: "staff",
  });

  console.log(
    "[enable-transcript-flow]",
    JSON.stringify({
      phase: "api_before_twilio_streams_create",
      client_leg_call_sid: callSid,
      canonical_external_call_id_for_bridge: canonicalExternalId,
      pstn_call_sid_from_row: pstnCallSid,
      track,
      wss_has_softphone_transcript: clientWss.includes("softphone_transcript=1"),
      bridge_writeback_uses_canonical_external_call_id: canonicalExternalId,
    })
  );

  console.log(
    "[transcript-e2e]",
    JSON.stringify({
      phase: "start_transcript_resolved",
      client_leg_call_sid: `${callSid.slice(0, 10)}…`,
      canonical_external_call_id_for_bridge: `${canonicalExternalId.slice(0, 10)}…`,
      metadata_source: metadataSource || null,
      track,
      track_rationale:
        body.track != null
          ? "explicit_body"
          : hasConferencePstn && metadataSource === "twilio_voice_softphone"
            ? "conference_softphone_pstn_split"
            : "default_both_tracks_inbound_or_non_conference",
    })
  );

  console.log("[start-transcript] media_stream_requested", {
    phase: "client_then_maybe_pstn",
    clientCallSid: callSid,
    canonicalExternalIdForBridge: canonicalExternalId,
    pstnCallSidFromRow: pstnCallSid,
    track,
    clientWssUrl: clientWss,
    pstnWssUrlIfStarted:
      pstnCallSid && track === "inbound_track"
        ? appendSoftphoneTranscriptStreamParams(baseWss, {
            transcriptExternalId: canonicalExternalId,
            inputRole: "caller",
          })
        : null,
    audioIntent:
      track === "inbound_track"
        ? "client_leg_inbound (browser microphone toward Twilio)"
        : track === "outbound_track"
          ? "client_leg_outbound (audio Twilio plays to the browser earpiece)"
          : "both_tracks (caller + staff on this leg)",
    pstnPlan:
      track === "inbound_track"
        ? pstnCallSid
          ? "will_attempt_pstn_inbound_after_client_ok"
          : "defer_pstn_until_pstn_call_sid_linked (merge hook or pstnOnly)"
        : "pstn_not_started_for_non_inbound_client_track",
  });

  const clientResult = await startCallMediaStream({
    callSid,
    wssUrl: clientWss,
    track,
  });

  if (!clientResult.ok) {
    console.error("[start-transcript] client_stream_twilio_error", {
      clientCallSid: callSid,
      track,
      clientWssUrl: clientWss,
      twilioErrorFull: clientResult.error,
    });
    return NextResponse.json({ error: clientResult.error }, { status: 502 });
  }

  console.log("[start-transcript] client_stream_twilio_ok", {
    clientCallSid: callSid,
    clientStreamSid: clientResult.streamSid ?? null,
    track,
    clientWssUrl: clientWss,
  });

  await upsertPhoneCallTranscriptStreams(supabaseAdmin, callSid, {
    client_stream_sid: clientResult.streamSid ?? null,
    client_stream_started_at: new Date().toISOString(),
  });

  const pstnDeferred =
    track === "inbound_track"
      ? await maybeStartDeferredPstnTranscriptStream(supabaseAdmin, callSid, "start_transcript_after_client_ok")
      : null;

  console.log("[start-transcript] summary", {
    clientCallSid: callSid,
    pstnCallSidFromRow: pstnCallSid,
    clientStreamStarted: true,
    clientStreamSid: clientResult.streamSid ?? null,
    pstnDeferred,
  });

  logTwilioVoiceTrace({
    route: "POST /api/workspace/phone/conference/start-transcript",
    client_call_sid: callSid,
    pstn_call_sid: pstnCallSid,
    ai_path_entered: false,
    softphone_bypass_path_entered: true,
    twiml_summary: `rest_start_media_stream|track=${track}|softphone_transcript_only`,
    branch: "staff_requested_live_transcript_streams",
  });

  await mergeSoftphoneConferenceMetadata(supabaseAdmin, callSid, {
    last_conference_event: "media_stream_started",
  });

  return NextResponse.json({
    ok: true,
    streamSid: clientResult.streamSid ?? null,
    pstnStreamSid: pstnDeferred?.pstnStreamSid ?? null,
    pstnDeferred,
  });
}
