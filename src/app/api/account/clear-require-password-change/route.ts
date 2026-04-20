import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { getStaffProfile } from "@/lib/staff-profile";

/**
 * Clears `staff_profiles.require_password_change` after the user sets a new password.
 * Called from the forced password change screen (session-authenticated).
 */
export async function POST() {
  const staff = await getStaffProfile();
  if (!staff) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const { error } = await supabaseAdmin
    .from("staff_profiles")
    .update({ require_password_change: false, updated_at: new Date().toISOString() })
    .eq("id", staff.id);

  if (error) {
    console.warn("[clear-require-password-change]", error.message);
    return NextResponse.json({ ok: false, error: "update_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
