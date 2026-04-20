import { NextResponse } from "next/server";

import {
  buildSoftphoneOutboundAllowlist,
  loadSoftphoneOutboundCallerConfigFromEnv,
} from "@/lib/softphone/outbound-caller-ids";
import { isValidE164 } from "@/lib/softphone/phone-number";
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
  const outboundCfg = loadSoftphoneOutboundCallerConfigFromEnv();
  let lines = outboundCfg
    ? outboundCfg.lines.map((l) => ({
        e164: l.e164,
        label: l.label,
        is_default: l.is_default,
      }))
    : [];
  let defaultE164 = outboundCfg?.defaultE164 ?? null;

  const dedicated = staff.dedicated_outbound_e164?.trim() ?? "";
  if (
    outboundCfg &&
    staff.phone_assignment_mode === "dedicated" &&
    dedicated &&
    isValidE164(dedicated) &&
    buildSoftphoneOutboundAllowlist(outboundCfg).has(dedicated)
  ) {
    lines = lines.map((l) => ({
      ...l,
      is_default: l.e164 === dedicated,
    }));
    defaultE164 = dedicated;
  }

  return NextResponse.json({
    conference_outbound_enabled: process.env.TWILIO_SOFTPHONE_USE_CONFERENCE === "true",
    media_stream_wss_configured: wss.startsWith("wss://"),
    /** Twilio native Real-Time Transcription status callback */
    transcription_callback_configured: Boolean(callbackUrl),
    /** Legacy POST /api/twilio/voice/bridge-transcript */
    legacy_bridge_transcript_configured: legacyBridge,
    transcript_writeback_configured: Boolean(callbackUrl) || legacyBridge,
    org_label: outboundCfg?.orgLabel ?? null,
    staff_user_id: staff.user_id,
    outbound_lines: lines,
    outbound_default_e164: defaultE164,
    outbound_block_available: Boolean(outboundCfg?.withheldCliE164),
  });
}
