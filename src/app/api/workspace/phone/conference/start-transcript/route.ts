import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { mergeSoftphoneConferenceMetadata } from "@/lib/phone/merge-softphone-conference-metadata";
import { canAccessWorkspacePhone, getStaffProfile } from "@/lib/staff-profile";
import { startCallMediaStream } from "@/lib/twilio/start-call-media-stream";

/**
 * Starts Twilio Media Streams on the Client leg; point `TWILIO_SOFTPHONE_MEDIA_STREAM_WSS_URL` at your
 * OpenAI Realtime bridge (e.g. scripts/twilio-openai-realtime-bridge.ts). No marketplace plugins.
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

  const wssUrl = process.env.TWILIO_SOFTPHONE_MEDIA_STREAM_WSS_URL?.trim();
  if (!wssUrl || !wssUrl.startsWith("wss://")) {
    return NextResponse.json(
      {
        error: "TWILIO_SOFTPHONE_MEDIA_STREAM_WSS_URL not set (must be wss://… to your media bridge)",
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

  await mergeSoftphoneConferenceMetadata(supabaseAdmin, callSid, {
    last_conference_event: "media_stream_started",
  });

  return NextResponse.json({ ok: true, streamSid: result.streamSid ?? null });
}
