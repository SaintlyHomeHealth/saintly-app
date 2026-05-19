import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { canRegisterMobilePushNotifications } from "@/lib/push/push-registration-access";
import { getStaffProfile } from "@/lib/staff-profile";

export const runtime = "nodejs";

/** Whether the signed-in staff user has at least one FCM device registered. */
export async function GET() {
  const staff = await getStaffProfile();
  if (!staff || !canRegisterMobilePushNotifications(staff)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }

  const { count, error } = await supabaseAdmin
    .from("user_push_devices")
    .select("id", { count: "exact", head: true })
    .eq("user_id", staff.user_id);

  if (error) {
    console.warn("[push/status] load devices:", error.message);
    return NextResponse.json({ error: "load_failed" }, { status: 500 });
  }

  return NextResponse.json({
    hasRegisteredDevice: (count ?? 0) > 0,
    pushNotificationsEnabled: staff.push_notifications_enabled !== false,
  });
}
