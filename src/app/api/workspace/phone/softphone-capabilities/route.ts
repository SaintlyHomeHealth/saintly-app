import { NextResponse } from "next/server";

import { canAccessWorkspacePhone, getStaffProfile } from "@/lib/staff-profile";
import { resolveTwilioMediaStreamWssUrl } from "@/lib/twilio/resolve-media-stream-wss-url";

/**
 * Non-secret flags for workspace softphone UI (conference + media stream).
 */
export async function GET() {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const wss = resolveTwilioMediaStreamWssUrl();
  return NextResponse.json({
    conference_outbound_enabled: process.env.TWILIO_SOFTPHONE_USE_CONFERENCE === "true",
    media_stream_wss_configured: wss.startsWith("wss://"),
    /** Bridge can POST transcript lines to /api/twilio/voice/bridge-transcript */
    transcript_writeback_configured: Boolean(process.env.REALTIME_BRIDGE_SHARED_SECRET?.trim()),
  });
}
