import { NextResponse } from "next/server";

import { sendFcmDataAndNotificationToUserIds } from "@/lib/push/send-fcm-to-user-ids";
import { canAccessWorkspacePhone, getStaffProfile } from "@/lib/staff-profile";
import { createServerSupabaseClient, getAuthenticatedUser } from "@/lib/supabase/server";

export const runtime = "nodejs";

const LOG = "[push-test-api]";

/**
 * Sends one test notification to every FCM token registered for the signed-in staff user.
 * Same session rules as POST /api/workspace/mobile/push/register (cookie auth from WebView).
 */
export async function POST() {
  const user = await getAuthenticatedUser();
  if (!user) {
    console.warn(LOG, "reject_401", { reason: "no_auth_session" });
    return NextResponse.json({ error: "Unauthorized", reason: "no_auth_session" }, { status: 401 });
  }

  const staff = await getStaffProfile();
  if (!staff) {
    console.warn(LOG, "reject_401", { reason: "no_staff_profile" });
    return NextResponse.json({ error: "Unauthorized", reason: "no_staff_profile" }, { status: 401 });
  }

  if (!canAccessWorkspacePhone(staff)) {
    console.warn(LOG, "reject_401", { reason: "workspace_phone_not_allowed" });
    return NextResponse.json({ error: "Unauthorized", reason: "workspace_phone_not_allowed" }, { status: 401 });
  }

  const supabase = await createServerSupabaseClient();
  const result = await sendFcmDataAndNotificationToUserIds(supabase, [staff.user_id], {
    title: "Saintly Test",
    body: "Push delivery is working",
    data: {
      type: "push_test",
      open_path: "/workspace/phone/keypad",
    },
  });

  if (!result.ok) {
    console.warn(LOG, "send_failed", { userId: staff.user_id, error: result.error });
    return NextResponse.json({ ok: false, error: result.error }, { status: 502 });
  }

  console.log(LOG, "send_ok", {
    userId: staff.user_id,
    sent: result.sent,
    failureCount: result.failureCount,
    invalidTokenRemovalCount: result.invalidTokenRemovalCount,
    errors: result.errors,
  });

  return NextResponse.json({
    ok: true,
    sent: result.sent,
    failureCount: result.failureCount,
    invalidTokenRemovalCount: result.invalidTokenRemovalCount,
    errors: result.errors,
  });
}
