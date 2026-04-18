import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import twilio from "twilio";

import { canAccessWorkspacePhone, getStaffProfile, getStaffProfileUsingSupabaseUserJwt } from "@/lib/staff-profile";
import { resolveInboundBrowserStaffUserIdsAsync } from "@/lib/softphone/inbound-staff-ids";
import { softphoneTwilioClientIdentity } from "@/lib/softphone/twilio-client-identity";

const AccessToken = twilio.jwt.AccessToken;
const VoiceGrant = AccessToken.VoiceGrant;

/**
 * Short-lived JWT for Twilio Voice JS SDK (outbound from browser).
 * Configure a TwiML App in Twilio Console with Voice URL:
 * POST {TWILIO_PUBLIC_BASE_URL}/api/twilio/voice/softphone
 * Outbound PSTN caller ID is set only via `TWILIO_SOFTPHONE_CALLER_ID_E164` on that route (not `TWILIO_VOICE_RING_E164`).
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  let staff = null;
  if (auth?.startsWith("Bearer ")) {
    const jwt = auth.slice(7).trim();
    if (jwt) {
      staff = await getStaffProfileUsingSupabaseUserJwt(jwt);
    }
  } else {
    staff = await getStaffProfile();
  }

  if (!staff || !canAccessWorkspacePhone(staff)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const apiKeySid = process.env.TWILIO_VOICE_API_KEY_SID?.trim();
  const apiKeySecret = process.env.TWILIO_VOICE_API_KEY_SECRET?.trim();
  const twimlAppSid = process.env.TWILIO_SOFTPHONE_TWIML_APP_SID?.trim();

  if (!accountSid || !apiKeySid || !apiKeySecret || !twimlAppSid) {
    return NextResponse.json(
      { error: "Softphone is not configured (Twilio API key / TwiML app)." },
      { status: 503 }
    );
  }

  /** Same string TwiML &lt;Client&gt; must dial for this browser to ring (see softphoneTwilioClientIdentity). */
  const identity = softphoneTwilioClientIdentity(staff.user_id);
  const inboundRingStaffIds = await resolveInboundBrowserStaffUserIdsAsync();
  const identityInInboundRingList = inboundRingStaffIds.includes(staff.user_id);

  console.log(
    JSON.stringify({
      tag: "inbound-ring-diag",
      step: "softphone_token",
      twilio_device_identity_exact: identity,
      auth_user_id_tail: staff.user_id.length >= 8 ? staff.user_id.slice(-8) : staff.user_id,
      inbound_resolve_count: inboundRingStaffIds.length,
      identity_in_inbound_resolve_list: identityInInboundRingList,
    })
  );

  const token = new AccessToken(accountSid, apiKeySid, apiKeySecret, {
    identity,
    ttl: 3600,
  });

  const voiceGrant = new VoiceGrant({
    outgoingApplicationSid: twimlAppSid,
    incomingAllow: true,
  });
  token.addGrant(voiceGrant);

  const jwt = token.toJwt();

  return NextResponse.json({
    token: jwt,
    identity,
    staff_user_id: staff.user_id,
    inbound_ring_staff_user_ids: inboundRingStaffIds,
    identity_in_inbound_ring_list: identityInInboundRingList,
    expiresInSeconds: 3600,
  });
}
