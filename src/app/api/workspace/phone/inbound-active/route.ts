import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { canAccessWorkspacePhone, getStaffProfile } from "@/lib/staff-profile";

const ACTIVE_STATUSES = ["initiated", "ringing", "in_progress"] as const;

/**
 * Workspace staff: whether an inbound OpenAI-realtime call is currently live (AI on the line).
 * Used to drive the call dock / banner when Twilio Client is not ringing (stream-only inbound).
 */
export async function GET() {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const since = new Date(Date.now() - 50 * 60 * 1000).toISOString();

  const { data, error } = await supabaseAdmin
    .from("phone_calls")
    .select("from_e164, external_call_id, status, started_at")
    .eq("direction", "inbound")
    .in("status", [...ACTIVE_STATUSES])
    .gte("started_at", since)
    .contains("metadata", { source: "twilio_voice_openai_realtime" })
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.warn("[workspace/phone/inbound-active]", error.message);
    return NextResponse.json({ active: false }, { status: 200 });
  }

  if (!data?.external_call_id) {
    return NextResponse.json({ active: false });
  }

  return NextResponse.json({
    active: true,
    from_e164: data.from_e164 ?? null,
    external_call_id: data.external_call_id,
    status: data.status,
  });
}
