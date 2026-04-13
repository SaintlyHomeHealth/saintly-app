import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { mergeSoftphoneConferenceMetadata } from "@/lib/phone/merge-softphone-conference-metadata";
import { canAccessWorkspacePhone, getStaffProfile } from "@/lib/staff-profile";
import { resolveTwilioMediaStreamWssUrl } from "@/lib/twilio/resolve-media-stream-wss-url";
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

  const wssUrl = resolveTwilioMediaStreamWssUrl();
  if (!wssUrl || !wssUrl.startsWith("wss://")) {
    return NextResponse.json(
      {
        error:
          "Media stream WSS URL not set. Set TWILIO_SOFTPHONE_MEDIA_STREAM_WSS_URL or TWILIO_REALTIME_MEDIA_STREAM_WSS_URL to the full wss://host/path (e.g. …/twilio/realtime-stream).",
        code: "media_stream_not_configured",
      },
      { status: 503 }
    );
  }

  const result = await startCallMediaStream({
    callSid,
    wssUrl,
    track: body.track ?? "both_tracks",
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 502 });
  }

  console.log("[start-transcript] twilio_media_stream_started", {
    callSid: callSid.slice(0, 12),
    streamSid: result.streamSid ?? null,
    wssTarget: wssUrl.replace(/^wss:\/\/([^/]+).*/, "wss://$1/…"),
  });

  await mergeSoftphoneConferenceMetadata(supabaseAdmin, callSid, {
    last_conference_event: "media_stream_started",
  });

  return NextResponse.json({ ok: true, streamSid: result.streamSid ?? null });
}
