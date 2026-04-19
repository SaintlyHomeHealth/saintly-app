import { randomUUID } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { upsertUserPushDeviceByInstallId } from "@/lib/push/upsert-user-push-device";
import { createServerSupabaseClient, getAuthenticatedUser } from "@/lib/supabase/server";
import { canAccessWorkspacePhone, getStaffProfile } from "@/lib/staff-profile";

export const runtime = "nodejs";

const LOG = "[push-register-api]";

type Body = {
  fcmToken?: string;
  platform?: string;
  deviceInstallId?: string | null;
};

/**
 * Registers an FCM device token for the signed-in staff user (cookie session).
 * Called from the in-app WebView via `injectJavaScript` so cookies authenticate the request.
 */
export async function POST(req: Request) {
  const reqId = randomUUID();

  console.log(LOG, "request_received", {
    reqId,
    url: req.url,
    method: req.method,
  });

  let cookieNames: string[] = [];
  let hasSupabaseCookie = false;
  try {
    const cookieStore = await cookies();
    cookieNames = cookieStore.getAll().map((c) => c.name);
    hasSupabaseCookie = cookieNames.some(
      (n) => n.startsWith("sb-") || n.includes("supabase") || n.includes("auth")
    );
    console.log(LOG, "cookies", {
      reqId,
      count: cookieNames.length,
      hasSupabaseCookie,
      names: cookieNames,
    });
  } catch (e) {
    console.warn(LOG, "cookies_read_failed", { reqId, message: String(e) });
  }

  const user = await getAuthenticatedUser();
  console.log(LOG, "auth_user", {
    reqId,
    hasUser: Boolean(user),
    userId: user?.id ?? null,
  });

  const staff = await getStaffProfile();
  const workspaceAllowed = staff ? canAccessWorkspacePhone(staff) : false;
  console.log(LOG, "staff_profile", {
    reqId,
    hasStaffProfile: Boolean(staff),
    userId: staff?.user_id ?? null,
    role: staff?.role ?? null,
    is_active: staff?.is_active ?? null,
    phone_access_enabled: staff?.phone_access_enabled ?? null,
    canAccessWorkspacePhone: workspaceAllowed,
  });

  if (!user) {
    console.warn(LOG, "reject_401", { reqId, reason: "no_auth_session" });
    return NextResponse.json(
      { error: "Unauthorized", reason: "no_auth_session" },
      { status: 401 }
    );
  }

  if (!staff) {
    console.warn(LOG, "reject_401", { reqId, reason: "no_staff_profile" });
    return NextResponse.json(
      { error: "Unauthorized", reason: "no_staff_profile" },
      { status: 401 }
    );
  }

  if (!workspaceAllowed) {
    console.warn(LOG, "reject_401", { reqId, reason: "workspace_phone_not_allowed" });
    return NextResponse.json(
      { error: "Unauthorized", reason: "workspace_phone_not_allowed" },
      { status: 401 }
    );
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    console.warn(LOG, "reject_400", { reqId, reason: "invalid_json" });
    return NextResponse.json({ error: "Invalid JSON", reason: "invalid_json" }, { status: 400 });
  }

  const fcmToken = typeof body.fcmToken === "string" ? body.fcmToken.trim() : "";
  const platformRaw = typeof body.platform === "string" ? body.platform.trim().toLowerCase() : "";
  const platform = platformRaw === "ios" || platformRaw === "android" ? platformRaw : null;

  if (!fcmToken || !platform) {
    console.warn(LOG, "reject_400", {
      reqId,
      reason: "missing_fcm_or_platform",
      hasFcmToken: Boolean(fcmToken),
      platformRaw: platformRaw || null,
    });
    return NextResponse.json(
      { error: "fcmToken and platform (ios|android) are required", reason: "missing_fcm_or_platform" },
      { status: 400 }
    );
  }

  const deviceInstallIdRaw =
    typeof body.deviceInstallId === "string" ? body.deviceInstallId.trim() : "";
  if (!deviceInstallIdRaw) {
    console.warn(LOG, "reject_400", { reqId, reason: "missing_device_install_id" });
    return NextResponse.json(
      { error: "deviceInstallId is required (stable id per app install)", reason: "missing_device_install_id" },
      { status: 400 }
    );
  }

  const supabase = await createServerSupabaseClient();
  const now = new Date().toISOString();

  /** SMS FCM on iOS uses APNs; keep `ios` explicit for routing (see sendFcmDataAndNotificationToUserIds). */
  const userPushPlatform = platform === "android" ? "android" : "ios";

  console.log(LOG, "upsert_start", {
    reqId,
    targetUserId: staff.user_id,
    platform: userPushPlatform,
    fcmTokenLength: fcmToken.length,
    hasDeviceInstallId: true,
  });

  const { error } = await upsertUserPushDeviceByInstallId(supabase, {
    userId: staff.user_id,
    fcmToken,
    deviceInstallId: deviceInstallIdRaw,
    platform: userPushPlatform,
    updatedAtIso: now,
  });

  if (error) {
    console.warn(LOG, "upsert_failed", {
      reqId,
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    return NextResponse.json(
      { error: "Failed to save device", reason: "upsert_failed", code: error.code },
      { status: 500 }
    );
  }

  console.log(LOG, "upsert_ok", { reqId, userId: staff.user_id, platform: userPushPlatform });
  return NextResponse.json({ ok: true, reqId });
}
