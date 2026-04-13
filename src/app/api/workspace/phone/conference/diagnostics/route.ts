import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { buildWorkspaceCallContextPayload } from "@/lib/phone/build-workspace-call-context";
import { canAccessWorkspacePhone, getStaffProfile } from "@/lib/staff-profile";

/**
 * Support / engineering: same data as call-context, explicit name for logs.
 * Use during a live call with the browser Client leg CallSid (CA…).
 */
export async function GET(req: Request) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const callSid = (url.searchParams.get("call_sid") ?? "").trim();
  if (!callSid || callSid.length < 10) {
    return NextResponse.json({ error: "call_sid required" }, { status: 400 });
  }

  const built = await buildWorkspaceCallContextPayload(supabaseAdmin, callSid);
  if (!built.found) {
    return NextResponse.json(
      {
        found: false,
        hint: "No phone_calls row for this CallSid — outbound softphone may not have logged yet.",
      },
      { status: 200 }
    );
  }

  return NextResponse.json({
    found: true,
    env: {
      TWILIO_SOFTPHONE_USE_CONFERENCE: process.env.TWILIO_SOFTPHONE_USE_CONFERENCE === "true",
    },
    ...built.payload,
  });
}
