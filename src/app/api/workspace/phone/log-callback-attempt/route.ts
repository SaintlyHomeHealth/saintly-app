import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { incrementVoiceCallSessionCallbackAttemptsByPhoneCallId } from "@/lib/phone/voice-call-sessions";
import { canAccessWorkspacePhone, getStaffProfile } from "@/lib/staff-profile";

/**
 * Tracks staff "Call back" attempts from workspace UI (best-effort, idempotent-friendly).
 */
export async function POST(req: Request) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { phone_call_id?: string };
  try {
    body = (await req.json()) as { phone_call_id?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const phoneCallId =
    typeof body.phone_call_id === "string" && /^[0-9a-f-]{36}$/i.test(body.phone_call_id.trim())
      ? body.phone_call_id.trim().toLowerCase()
      : "";

  if (!phoneCallId) {
    return NextResponse.json({ error: "phone_call_id required" }, { status: 400 });
  }

  const result = await incrementVoiceCallSessionCallbackAttemptsByPhoneCallId(supabaseAdmin, {
    phoneCallId,
  });

  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 400 });
  }

  return NextResponse.json({ ok: true, callback_attempt_count: result.count });
}
