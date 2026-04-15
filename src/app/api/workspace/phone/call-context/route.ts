import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { buildWorkspaceCallContextPayload } from "@/lib/phone/build-workspace-call-context";
import { canAccessWorkspacePhone, getStaffProfile } from "@/lib/staff-profile";

/**
 * Live caller context for the workspace softphone (AI summary + transcript + conference gating).
 * Query: `call_sid` — Twilio CallSid on the Client leg (`phone_calls.external_call_id`).
 */
export async function GET(req: Request) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(req.url);
  const callSid = (url.searchParams.get("call_sid") ?? "").trim();
  const rtDebug =
    url.searchParams.get("rt_debug") === "1" || process.env.TWILIO_RT_DEBUG === "1";
  if (!callSid || callSid.length < 10) {
    return NextResponse.json({ error: "call_sid required" }, { status: 400 });
  }

  const built = await buildWorkspaceCallContextPayload(supabaseAdmin, callSid);
  if (!built.found) {
    return NextResponse.json({ found: false }, { status: 200 });
  }

  if (rtDebug) {
    const entries = built.payload.voice_ai?.live_transcript_entries;
    const n = Array.isArray(entries) ? entries.length : 0;
    console.log(
      "[twilio_rt]",
      JSON.stringify({
        step: "twilio_rt_step_06_call_context_returned_entries",
        route: "GET /api/workspace/phone/call-context",
        call_sid: `${callSid.slice(0, 10)}…`,
        transcript_entry_count: n,
        has_voice_ai: Boolean(built.payload.voice_ai),
      })
    );
  }

  return NextResponse.json({
    found: true,
    ...built.payload,
  });
}
