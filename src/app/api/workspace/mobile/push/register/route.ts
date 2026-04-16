import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { canAccessWorkspacePhone, getStaffProfile } from "@/lib/staff-profile";

export const runtime = "nodejs";

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
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const fcmToken = typeof body.fcmToken === "string" ? body.fcmToken.trim() : "";
  const platformRaw = typeof body.platform === "string" ? body.platform.trim().toLowerCase() : "";
  const platform = platformRaw === "ios" || platformRaw === "android" ? platformRaw : null;

  if (!fcmToken || !platform) {
    return NextResponse.json({ error: "fcmToken and platform (ios|android) are required" }, { status: 400 });
  }

  const deviceInstallId =
    typeof body.deviceInstallId === "string" && body.deviceInstallId.trim()
      ? body.deviceInstallId.trim()
      : null;

  const supabase = await createServerSupabaseClient();
  const now = new Date().toISOString();

  const { error } = await supabase.from("user_push_devices").upsert(
    {
      user_id: staff.user_id,
      platform,
      fcm_token: fcmToken,
      device_install_id: deviceInstallId,
      updated_at: now,
    },
    { onConflict: "user_id,fcm_token" }
  );

  if (error) {
    console.warn("[api/workspace/mobile/push/register]", error.message);
    return NextResponse.json({ error: "Failed to save device" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
