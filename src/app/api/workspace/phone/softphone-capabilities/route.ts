import { NextResponse } from "next/server";

import { canAccessWorkspacePhone, getStaffProfile } from "@/lib/staff-profile";
import { resolveTwilioMediaStreamWssUrl } from "@/lib/twilio/resolve-media-stream-wss-url";
import { resolveTranscriptionStatusCallbackUrl } from "@/lib/twilio/resolve-transcription-callback-url";

/**
 * Non-secret flags for workspace softphone UI (conference + media stream + transcription).
 */
export async function GET() {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const wss = resolveTwilioMediaStreamWssUrl();
  const callbackUrl = resolveTranscriptionStatusCallbackUrl();
  const legacyBridge = Boolean(process.env.REALTIME_BRIDGE_SHARED_SECRET?.trim());
  return NextResponse.json({
    conference_outbound_enabled: process.env.TWILIO_SOFTPHONE_USE_CONFERENCE === "true",
    media_stream_wss_configured: wss.startsWith("wss://"),
    /** Twilio native Real-Time Transcription status callback */
    transcription_callback_configured: Boolean(callbackUrl),
    /** Legacy POST /api/twilio/voice/bridge-transcript */
    legacy_bridge_transcript_configured: legacyBridge,
    transcript_writeback_configured: Boolean(callbackUrl) || legacyBridge,
  });
}
