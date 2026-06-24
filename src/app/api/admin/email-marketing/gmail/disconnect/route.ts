import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { CRM_SHARED_MAILBOX_EMAIL } from "@/lib/email-marketing/gmail/constants";
import { getStaffProfile, isAdminOrHigher } from "@/lib/staff-profile";

export const runtime = "nodejs";

export async function POST() {
  const staff = await getStaffProfile();
  if (!staff || !isAdminOrHigher(staff)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const target =
    process.env.GOOGLE_GMAIL_CONNECTED_EMAIL?.trim().toLowerCase() || CRM_SHARED_MAILBOX_EMAIL;

  const { error } = await supabaseAdmin
    .from("email_mailboxes")
    .update({
      oauth_refresh_token: null,
      status: "disconnected",
      sync_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("email_address", target);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
