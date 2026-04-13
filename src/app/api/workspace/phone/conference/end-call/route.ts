import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { canAccessWorkspacePhone, getStaffProfile } from "@/lib/staff-profile";
import type { SoftphoneConferenceMeta } from "@/lib/twilio/softphone-conference";
import { teardownSoftphoneConferenceFromMetadata } from "@/lib/twilio/softphone-conference-teardown";

/**
 * End the full softphone conference + PSTN legs (not just the browser Device.disconnect).
 * Staff presses Hang up → client posts Client CallSid → we complete the Twilio Conference (or fall back to ending each CA leg).
 */
export async function POST(req: Request) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { callSid?: string };
  try {
    body = (await req.json()) as { callSid?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const callSid = typeof body.callSid === "string" && body.callSid.startsWith("CA") ? body.callSid.trim() : "";
  if (!callSid) {
    return NextResponse.json({ error: "callSid required (Client leg CA…)" }, { status: 400 });
  }

  console.log("[workspace/phone/conference/end-call] request", {
    clientLeg: `${callSid.slice(0, 10)}…`,
    staffUserId: staff.user_id,
  });

  const { data: row } = await supabaseAdmin
    .from("phone_calls")
    .select("metadata")
    .eq("external_call_id", callSid)
    .maybeSingle();

  const meta = row?.metadata as Record<string, unknown> | undefined;
  const sc = meta?.softphone_conference as SoftphoneConferenceMeta | undefined;

  const result = await teardownSoftphoneConferenceFromMetadata({
    clientCallSid: callSid,
    softphoneConference: sc ?? null,
    reason: "workspace_end_call_button",
  });

  return NextResponse.json({
    ok: result.ok,
    steps: result.steps,
    error: result.error,
  });
}
