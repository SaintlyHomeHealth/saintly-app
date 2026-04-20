import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import twilio from "twilio";

import {
  canAccessWorkspacePhone,
  getStaffProfile,
  getStaffProfileUsingSupabaseUserJwt,
  staffAllowsInboundSoftphone,
} from "@/lib/staff-profile";
import { computeIdentityInInboundRingListForStaff } from "@/lib/softphone/inbound-staff-ids";
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
  console.warn(
    "[SAINTLY-TRACE]",
    JSON.stringify({ route: "GET /api/softphone/token", step: "request_received" })
  );

  const auth = request.headers.get("authorization");
  const authPath = auth?.startsWith("Bearer ") ? "bearer" : "cookie";
  console.warn(
    "[SAINTLY-TRACE]",
    JSON.stringify({ route: "GET /api/softphone/token", step: "auth_path", authPath })
  );

  let staff = null;
  if (auth?.startsWith("Bearer ")) {
    const jwt = auth.slice(7).trim();
    if (jwt) {
      staff = await getStaffProfileUsingSupabaseUserJwt(jwt);
    }
  } else {
    staff = await getStaffProfile();
  }

  const staffResolved = Boolean(staff && canAccessWorkspacePhone(staff));
  console.warn(
    "[SAINTLY-TRACE]",
    JSON.stringify({ route: "GET /api/softphone/token", step: "staff_gate", staffResolved })
  );

  if (!staff || !canAccessWorkspacePhone(staff)) {
    console.warn(
      "[SAINTLY-TRACE]",
      JSON.stringify({ route: "GET /api/softphone/token", step: "response", tokenMinted: false, status: 401 })
    );
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (staff.softphone_web_enabled === false) {
    return NextResponse.json({ error: "Web softphone is disabled for this staff member." }, { status: 403 });
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const apiKeySid = process.env.TWILIO_VOICE_API_KEY_SID?.trim();
  const apiKeySecret = process.env.TWILIO_VOICE_API_KEY_SECRET?.trim();
  const twimlAppSid = process.env.TWILIO_SOFTPHONE_TWIML_APP_SID?.trim();
  /** iOS VoIP (PushKit): Twilio Console → Voice → Push Credentials (VoIP). Required for native incoming when app is backgrounded. */
  const pushCredentialSid = process.env.TWILIO_SOFTPHONE_IOS_PUSH_CREDENTIAL_SID?.trim();

  if (!accountSid || !apiKeySid || !apiKeySecret || !twimlAppSid) {
    console.warn(
      "[SAINTLY-TRACE]",
      JSON.stringify({ route: "GET /api/softphone/token", step: "response", tokenMinted: false, status: 503 })
    );
    return NextResponse.json(
      { error: "Softphone is not configured (Twilio API key / TwiML app)." },
      { status: 503 }
    );
  }

  /** Same string TwiML &lt;Client&gt; must dial for this browser to ring (see softphoneTwilioClientIdentity). */
  const identity = softphoneTwilioClientIdentity(staff.user_id);
  /** Avoid full-table `staff_profiles` scan here (was 5–12s in prod); list is available via cached `resolveInboundBrowserStaffUserIdsAsync` elsewhere. */
  const identityInInboundRingList = await computeIdentityInInboundRingListForStaff(staff);

  console.log(
    JSON.stringify({
      tag: "inbound-ring-diag",
      step: "softphone_token",
      twilio_device_identity_exact: identity,
      auth_user_id_tail: staff.user_id.length >= 8 ? staff.user_id.slice(-8) : staff.user_id,
      identity_in_inbound_resolve_list: identityInInboundRingList,
      inbound_ring_list: "computed_per_staff_no_full_scan",
    })
  );

  const token = new AccessToken(accountSid, apiKeySid, apiKeySecret, {
    identity,
    ttl: 3600,
  });

  const allowIncoming = staffAllowsInboundSoftphone(staff);
  const voiceGrant = new VoiceGrant({
    outgoingApplicationSid: twimlAppSid,
    incomingAllow: allowIncoming,
    ...(pushCredentialSid && allowIncoming ? { pushCredentialSid } : {}),
  });
  token.addGrant(voiceGrant);

  const jwt = token.toJwt();

  console.warn(
    "[SAINTLY-TRACE]",
    JSON.stringify({
      route: "GET /api/softphone/token",
      step: "response",
      tokenMinted: true,
      status: 200,
      twilioJwtLength: jwt.length,
    })
  );

  return NextResponse.json({
    token: jwt,
    identity,
    staff_user_id: staff.user_id,
    identity_in_inbound_ring_list: identityInInboundRingList,
    expiresInSeconds: 3600,
  });
}
