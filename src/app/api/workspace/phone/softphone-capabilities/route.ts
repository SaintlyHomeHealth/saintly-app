import { NextResponse } from "next/server";

import { canAccessWorkspacePhone, getStaffProfile } from "@/lib/staff-profile";

/**
 * Non-secret flags for workspace softphone UI (conference + media stream).
 */
export async function GET() {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const wss = process.env.TWILIO_SOFTPHONE_MEDIA_STREAM_WSS_URL?.trim() ?? "";
  return NextResponse.json({
    conference_outbound_enabled: process.env.TWILIO_SOFTPHONE_USE_CONFERENCE === "true",
    media_stream_wss_configured: wss.startsWith("wss://"),
  });
}
