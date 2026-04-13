import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { mergeSoftphoneConferenceMetadata } from "@/lib/phone/merge-softphone-conference-metadata";
import { canAccessWorkspacePhone, getStaffProfile } from "@/lib/staff-profile";
import {
  appendSoftphoneTranscriptStreamParams,
  resolveTwilioMediaStreamWssUrl,
} from "@/lib/twilio/resolve-media-stream-wss-url";
import { startCallMediaStream } from "@/lib/twilio/start-call-media-stream";

/**
 * Starts Twilio Media Streams on the Client leg. WSS URL from
 * `TWILIO_SOFTPHONE_MEDIA_STREAM_WSS_URL` or `TWILIO_REALTIME_MEDIA_STREAM_WSS_URL` (full URL with path).
 * No marketplace plugins.
 */
export async function POST(req: Request) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { callSid?: string; track?: "inbound_track" | "outbound_track" | "both_tracks" };
  try {
    body = (await req.json()) as { callSid?: string; track?: "inbound_track" | "outbound_track" | "both_tracks" };
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

  /** Default `inbound_track`: WebRTC Client leg audio *from the browser toward Twilio* (staff mic). `both_tracks` mixes mic + playback (PSTN/conference/assistant) and confuses Whisper + labels. */
  const track = body.track ?? "inbound_track";

  const clientWss = appendSoftphoneTranscriptStreamParams(baseWss, {
    transcriptExternalId: callSid,
    inputRole: "staff",
  });

  const { data: confRow } = await supabaseAdmin
    .from("phone_calls")
    .select("metadata")
    .eq("external_call_id", callSid)
    .maybeSingle();

  const meta = confRow?.metadata && typeof confRow.metadata === "object" && !Array.isArray(confRow.metadata)
    ? (confRow.metadata as Record<string, unknown>)
    : {};
  const sc =
    meta.softphone_conference && typeof meta.softphone_conference === "object" && !Array.isArray(meta.softphone_conference)
      ? (meta.softphone_conference as Record<string, unknown>)
      : {};
  const pstnCallSid =
    typeof sc.pstn_call_sid === "string" && sc.pstn_call_sid.startsWith("CA") ? sc.pstn_call_sid.trim() : null;

  console.log("[start-transcript] media_stream_requested", {
    clientCallSid: callSid.slice(0, 12),
    track,
    audioIntent:
      track === "inbound_track"
        ? "client_leg_inbound (browser microphone toward Twilio)"
        : track === "outbound_track"
          ? "client_leg_outbound (audio Twilio plays to the browser earpiece)"
          : "both_tracks (mixed — not recommended for attribution)",
    pstnStream: pstnCallSid ? `will_start pstn inbound ${pstnCallSid.slice(0, 12)}…` : "skipped (no pstn_call_sid on row yet)",
  });

  const clientResult = await startCallMediaStream({
    callSid,
    wssUrl: clientWss,
    track,
  });

  if (!clientResult.ok) {
    return NextResponse.json({ error: clientResult.error }, { status: 502 });
  }

  let pstnStreamSid: string | null = null;
  let pstnStreamError: string | null = null;
  if (pstnCallSid && track === "inbound_track") {
    const pstnWss = appendSoftphoneTranscriptStreamParams(baseWss, {
      transcriptExternalId: callSid,
      inputRole: "caller",
    });
    const pstnResult = await startCallMediaStream({
      callSid: pstnCallSid,
      wssUrl: pstnWss,
      track: "inbound_track",
    });
    if (pstnResult.ok) {
      pstnStreamSid = pstnResult.streamSid ?? null;
    } else {
      pstnStreamError = pstnResult.error;
      console.warn("[start-transcript] pstn_media_stream_failed", {
        pstnCallSid: pstnCallSid.slice(0, 12),
        error: pstnResult.error.slice(0, 200),
      });
    }
  }

  console.log("[start-transcript] twilio_media_stream_connected", {
    clientCallSid: callSid.slice(0, 12),
    clientStreamSid: clientResult.streamSid ?? null,
    pstnStreamSid,
    pstnStreamError,
    wssTarget: baseWss.replace(/^wss:\/\/([^/]+).*/, "wss://$1/…"),
  });

  await mergeSoftphoneConferenceMetadata(supabaseAdmin, callSid, {
    last_conference_event: "media_stream_started",
  });

  return NextResponse.json({
    ok: true,
    streamSid: clientResult.streamSid ?? null,
    pstnStreamSid,
    pstnStreamError,
  });
}
