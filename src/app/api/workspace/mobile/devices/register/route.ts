import { randomUUID } from "crypto";
import { NextResponse } from "next/server";

import { upsertUserPushDeviceByInstallId } from "@/lib/push/upsert-user-push-device";
import { createServerSupabaseClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { softphoneTwilioClientIdentity } from "@/lib/softphone/twilio-client-identity";
import { canAccessWorkspacePhone, getStaffProfile } from "@/lib/staff-profile";

export const runtime = "nodejs";

const LOG = "[devices-register-api]";

type Body = {
  /** Client-generated UUID persisted in Keychain — preferred upsert key. */
  deviceId?: string;
  fcmToken?: string | null;
  voipToken?: string | null;
  platform?: string;
  deviceInstallId?: string | null;
  appVersion?: string | null;
};

/**
 * Registers or updates a row in `devices` for Twilio Voice multi-device ringing.
 * Also upserts `user_push_devices` when `fcmToken` is present (SMS / legacy alerts).
 */
export async function POST(req: Request) {
  const reqId = randomUUID();

  const user = await getAuthenticatedUser();
  const staff = await getStaffProfile();
  const workspaceAllowed = staff ? canAccessWorkspacePhone(staff) : false;

  if (!user) {
    return NextResponse.json({ error: "Unauthorized", reason: "no_auth_session" }, { status: 401 });
  }
  if (!staff) {
    return NextResponse.json({ error: "Unauthorized", reason: "no_staff_profile" }, { status: 401 });
  }
  if (!workspaceAllowed) {
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
  if (!platform) {
    return NextResponse.json({ error: "platform (ios|android) is required" }, { status: 400 });
  }

  const fcmToken =
    typeof body.fcmToken === "string" && body.fcmToken.trim() ? body.fcmToken.trim() : null;
  const voipToken =
    typeof body.voipToken === "string" && body.voipToken.trim() ? body.voipToken.trim() : null;
  const deviceInstallId =
    typeof body.deviceInstallId === "string" && body.deviceInstallId.trim()
      ? body.deviceInstallId.trim()
      : null;

  if (fcmToken && !deviceInstallId) {
    return NextResponse.json(
      { error: "deviceInstallId is required when fcmToken is set", reason: "missing_device_install_id" },
      { status: 400 }
    );
  }
  const appVersion =
    typeof body.appVersion === "string" && body.appVersion.trim() ? body.appVersion.trim() : null;

  if (platform === "android" && !fcmToken) {
    return NextResponse.json({ error: "fcmToken is required for android" }, { status: 400 });
  }
  if (platform === "ios" && !fcmToken && !voipToken) {
    return NextResponse.json(
      { error: "Provide fcmToken and/or voipToken for ios" },
      { status: 400 }
    );
  }

  const twilioIdentity = softphoneTwilioClientIdentity(staff.user_id);
  const now = new Date().toISOString();
  const supabase = await createServerSupabaseClient();

  const deviceId =
    typeof body.deviceId === "string" && /^[0-9a-f-]{36}$/i.test(body.deviceId.trim())
      ? body.deviceId.trim().toLowerCase()
      : null;

  if (deviceId) {
    const { data: existing, error: exErr } = await supabase
      .from("devices")
      .select("id, user_id")
      .eq("id", deviceId)
      .maybeSingle();

    if (exErr) {
      console.warn(LOG, "lookup_failed", { reqId, message: exErr.message });
      return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
    }
    if (!existing || existing.user_id !== staff.user_id) {
      return NextResponse.json({ error: "Invalid device" }, { status: 400 });
    }

    const { error: upErr } = await supabase
      .from("devices")
      .update({
        platform,
        fcm_token: fcmToken,
        voip_token: voipToken,
        twilio_identity: twilioIdentity,
        device_install_id: deviceInstallId,
        app_version: appVersion,
        last_seen_at: now,
        is_active: true,
        updated_at: now,
      })
      .eq("id", deviceId);

    if (upErr) {
      console.warn(LOG, "update_failed", { reqId, message: upErr.message });
      return NextResponse.json({ error: "Failed to update device" }, { status: 500 });
    }

    if (fcmToken && deviceInstallId) {
      const userPushPlatform = platform === "android" ? "android" : "ios";
      const { error: upPushErr } = await upsertUserPushDeviceByInstallId(supabase, {
        userId: staff.user_id,
        fcmToken,
        deviceInstallId,
        platform: userPushPlatform,
        updatedAtIso: now,
      });
      if (upPushErr) {
        console.warn(LOG, "user_push_devices_upsert_failed", { reqId, message: upPushErr.message });
        return NextResponse.json({ error: "Failed to save push device" }, { status: 500 });
      }
    }

    console.log(LOG, "updated", { reqId, deviceId });
    return NextResponse.json({ ok: true, reqId, deviceId });
  }

  const insertRow: Record<string, unknown> = {
    user_id: staff.user_id,
    platform,
    fcm_token: fcmToken,
    voip_token: voipToken,
    twilio_identity: twilioIdentity,
    device_install_id: deviceInstallId,
    app_version: appVersion,
    last_seen_at: now,
    is_active: true,
    updated_at: now,
  };

  const { data: inserted, error: insErr } = await supabase
    .from("devices")
    .insert(insertRow)
    .select("id")
    .single();

  if (insErr) {
    if (insErr.code === "23505" && deviceInstallId) {
      const { data: dupe, error: dupeErr } = await supabase
        .from("devices")
        .select("id")
        .eq("user_id", staff.user_id)
        .eq("device_install_id", deviceInstallId)
        .maybeSingle();

      if (!dupeErr && dupe?.id) {
        const { error: up2 } = await supabase
          .from("devices")
          .update({
            platform,
            fcm_token: fcmToken,
            voip_token: voipToken,
            twilio_identity: twilioIdentity,
            app_version: appVersion,
            last_seen_at: now,
            is_active: true,
            updated_at: now,
          })
          .eq("id", dupe.id);

        if (!up2 && fcmToken && deviceInstallId) {
          const userPushPlatform = platform === "android" ? "android" : "ios";
          const { error: upPushErr } = await upsertUserPushDeviceByInstallId(supabase, {
            userId: staff.user_id,
            fcmToken,
            deviceInstallId,
            platform: userPushPlatform,
            updatedAtIso: now,
          });
          if (upPushErr) {
            console.warn(LOG, "user_push_devices_upsert_failed", { reqId, message: upPushErr.message });
            return NextResponse.json({ error: "Failed to save push device" }, { status: 500 });
          }
        }
        if (up2) {
          console.warn(LOG, "dedupe_update_failed", { reqId, message: up2.message });
          return NextResponse.json({ error: "Failed to save device" }, { status: 500 });
        }
        console.log(LOG, "dedupe_upsert", { reqId, deviceId: dupe.id });
        return NextResponse.json({ ok: true, reqId, deviceId: dupe.id as string });
      }
    }
    console.warn(LOG, "insert_failed", { reqId, message: insErr.message, code: insErr.code });
    return NextResponse.json({ error: "Failed to save device" }, { status: 500 });
  }

  const newId = inserted?.id as string;

  if (fcmToken && deviceInstallId) {
    const userPushPlatform = platform === "android" ? "android" : "ios";
    const { error: upPushErr } = await upsertUserPushDeviceByInstallId(supabase, {
      userId: staff.user_id,
      fcmToken,
      deviceInstallId,
      platform: userPushPlatform,
      updatedAtIso: now,
    });
    if (upPushErr) {
      console.warn(LOG, "user_push_devices_upsert_failed", { reqId, message: upPushErr.message });
      return NextResponse.json({ error: "Failed to save push device" }, { status: 500 });
    }
  }

  console.log(LOG, "inserted", { reqId, deviceId: newId });
  return NextResponse.json({ ok: true, reqId, deviceId: newId });
}
