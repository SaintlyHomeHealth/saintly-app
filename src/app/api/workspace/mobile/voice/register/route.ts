import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

import { createServerSupabaseClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { canAccessWorkspacePhone, getStaffProfile } from "@/lib/staff-profile";
import { softphoneTwilioClientIdentity } from "@/lib/softphone/twilio-client-identity";

export const runtime = "nodejs";

const LOG = "[voice-register-api]";

type Body = {
  fcmToken?: string | null;
  voipPushToken?: string | null;
  platform?: string;
  twilioIdentity?: string;
  deviceInstallId?: string | null;
  appVersion?: string | null;
};

/**
 * Registers this device for Twilio Voice tracking (PushKit + CallKit on iOS, FCM via Twilio on Android).
 * Does not replace Twilio SDK registration — call after native `Voice.register(accessToken)`.
 */
export async function POST(req: Request) {
  const reqId = randomUUID();
  const user = await getAuthenticatedUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized", reason: "no_auth_session" }, { status: 401 });
  }

  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff)) {
    return NextResponse.json({ error: "Unauthorized", reason: "workspace_phone_not_allowed" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const platformRaw = typeof body.platform === "string" ? body.platform.trim().toLowerCase() : "";
  const platform = platformRaw === "ios" || platformRaw === "android" ? platformRaw : null;
  const fcmToken = typeof body.fcmToken === "string" ? body.fcmToken.trim() : "";
  const voipPushToken = typeof body.voipPushToken === "string" ? body.voipPushToken.trim() : "";
  const twilioIdentityRaw = typeof body.twilioIdentity === "string" ? body.twilioIdentity.trim() : "";
  const deviceInstallId =
    typeof body.deviceInstallId === "string" && body.deviceInstallId.trim()
      ? body.deviceInstallId.trim()
      : null;
  const appVersion = typeof body.appVersion === "string" && body.appVersion.trim() ? body.appVersion.trim() : null;

  if (!platform) {
    return NextResponse.json({ error: "platform (ios|android) is required" }, { status: 400 });
  }

  const expectedIdentity = softphoneTwilioClientIdentity(staff.user_id);
  const twilioIdentity = twilioIdentityRaw || expectedIdentity;
  if (twilioIdentity !== expectedIdentity) {
    console.warn(LOG, "identity_mismatch", { reqId, expectedTail: expectedIdentity.slice(-12) });
    return NextResponse.json({ error: "twilioIdentity does not match signed-in user" }, { status: 403 });
  }

  if (!fcmToken) {
    return NextResponse.json(
      { error: "fcmToken is required (same device token as SMS push registration)" },
      { status: 400 }
    );
  }

  const supabase = await createServerSupabaseClient();
  const now = new Date().toISOString();

  const row: Record<string, unknown> = {
    user_id: staff.user_id,
    platform,
    fcm_token: fcmToken,
    twilio_identity: twilioIdentity,
    device_install_id: deviceInstallId,
    app_version: appVersion,
    last_seen_at: now,
    updated_at: now,
    is_active: true,
  };
  if (voipPushToken) {
    row.voip_token = voipPushToken;
  }

  console.log(LOG, "request", {
    reqId,
    platform,
    fcmTokenLen: fcmToken.length,
    voipPushTokenLen: voipPushToken.length,
    twilioIdentityTail: twilioIdentity.length >= 12 ? twilioIdentity.slice(-12) : twilioIdentity,
  });

  const { error } = await supabase.from("devices").upsert(row, {
    onConflict: "user_id,fcm_token",
  });
  if (error) {
    console.warn(LOG, "upsert_failed", { reqId, table: "devices", message: error.message });
    return NextResponse.json({ error: "Failed to save voice device" }, { status: 500 });
  }

  /**
   * SMS / generic FCM uses `user_push_devices` (see `sendFcmDataAndNotificationToUserIds`).
   * `/push/register` can race before the WebView session is ready; mirroring the token here when
   * voice registration succeeds ensures inbound SMS push targets the current device immediately.
   */
  const { error: pushDevErr } = await supabase.from("user_push_devices").upsert(
    {
      user_id: staff.user_id,
      platform,
      fcm_token: fcmToken,
      device_install_id: deviceInstallId,
      updated_at: now,
    },
    { onConflict: "user_id,fcm_token" }
  );
  if (pushDevErr) {
    console.warn(LOG, "user_push_devices_upsert_failed", { reqId, message: pushDevErr.message });
  }

  console.log(LOG, "ok", { reqId, userId: staff.user_id, platform });
  return NextResponse.json({ ok: true, reqId, twilioIdentity: expectedIdentity });
}
