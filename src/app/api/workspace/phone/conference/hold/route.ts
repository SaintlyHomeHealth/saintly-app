import { NextResponse } from "next/server";
import twilio from "twilio";

import { supabaseAdmin } from "@/lib/admin";
import { mergeSoftphoneConferenceMetadata } from "@/lib/phone/merge-softphone-conference-metadata";
import { canAccessWorkspacePhone, getStaffProfile } from "@/lib/staff-profile";
import type { SoftphoneConferenceMeta } from "@/lib/twilio/softphone-conference";

/**
 * True PSTN hold: Twilio Conference participant (callee) held with optional hold music (holdUrl).
 * Requires `TWILIO_SOFTPHONE_USE_CONFERENCE=true` and conference metadata populated by webhooks.
 */
export async function POST(req: Request) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { hold?: boolean; callSid?: string };
  try {
    body = (await req.json()) as { hold?: boolean; callSid?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const hold = Boolean(body.hold);
  const callSid = typeof body.callSid === "string" ? body.callSid.trim() : "";
  if (!callSid.startsWith("CA")) {
    return NextResponse.json({ error: "callSid required (Client leg CallSid)" }, { status: 400 });
  }

  const { data: row, error: findErr } = await supabaseAdmin
    .from("phone_calls")
    .select("metadata")
    .eq("external_call_id", callSid)
    .maybeSingle();

  if (findErr || !row?.metadata || typeof row.metadata !== "object") {
    return NextResponse.json({ error: "Call not found" }, { status: 404 });
  }

  const meta = row.metadata as Record<string, unknown>;
  const sc = meta.softphone_conference as SoftphoneConferenceMeta | undefined;
  const conferenceSid = sc?.conference_sid?.trim();
  const pstnCallSid = sc?.pstn_call_sid?.trim();
  if (!conferenceSid || !pstnCallSid) {
    return NextResponse.json(
      {
        error: "Conference not ready",
        hint: "Enable TWILIO_SOFTPHONE_USE_CONFERENCE=true and wait for participants to join.",
      },
      { status: 409 }
    );
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const publicBase = process.env.TWILIO_PUBLIC_BASE_URL?.trim().replace(/\/$/, "");
  if (!accountSid || !authToken || !publicBase) {
    return NextResponse.json({ error: "Twilio not configured" }, { status: 503 });
  }

  const holdUrl = `${publicBase}/api/twilio/voice/softphone-hold-music`;

  try {
    const client = twilio(accountSid, authToken);
    await client.conferences(conferenceSid).participants(pstnCallSid).update({
      hold,
      holdUrl,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[workspace/phone/conference/hold]", msg);
    return NextResponse.json({ error: "Twilio hold failed", detail: msg.slice(0, 200) }, { status: 502 });
  }

  await mergeSoftphoneConferenceMetadata(supabaseAdmin, callSid, { pstn_on_hold: hold });

  return NextResponse.json({ ok: true, hold });
}
