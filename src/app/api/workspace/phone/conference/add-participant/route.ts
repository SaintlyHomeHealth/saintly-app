import { NextResponse } from "next/server";
import twilio from "twilio";

import { supabaseAdmin } from "@/lib/admin";
import { isValidE164, isValidWorkspaceOutboundDestinationE164 } from "@/lib/softphone/phone-number";
import { canAccessWorkspacePhone, getStaffProfile } from "@/lib/staff-profile";
import type { SoftphoneConferenceMeta } from "@/lib/twilio/softphone-conference";

/**
 * Dials a third party into the same Twilio Conference (3-way / add-call).
 */
export async function POST(req: Request) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { toE164?: string; callSid?: string };
  try {
    body = (await req.json()) as { toE164?: string; callSid?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const toE164 = typeof body.toE164 === "string" ? body.toE164.trim() : "";
  if (!isValidWorkspaceOutboundDestinationE164(toE164)) {
    return NextResponse.json({ error: "Invalid phone number" }, { status: 400 });
  }

  const clientCallSid =
    typeof body.callSid === "string" && body.callSid.startsWith("CA") ? body.callSid.trim() : "";
  if (!clientCallSid) {
    return NextResponse.json({ error: "callSid required (Client leg)" }, { status: 400 });
  }

  const { data: row } = await supabaseAdmin
    .from("phone_calls")
    .select("metadata")
    .eq("external_call_id", clientCallSid)
    .maybeSingle();

  const meta = row?.metadata as Record<string, unknown> | undefined;
  const sc = meta?.softphone_conference as SoftphoneConferenceMeta | undefined;
  const conferenceSid = sc?.conference_sid?.trim();
  if (!conferenceSid) {
    return NextResponse.json({ error: "Conference not ready" }, { status: 409 });
  }

  const callerId = process.env.TWILIO_SOFTPHONE_CALLER_ID_E164?.trim() || "";
  if (!callerId || !isValidE164(callerId)) {
    return NextResponse.json({ error: "TWILIO_SOFTPHONE_CALLER_ID_E164 not configured" }, { status: 503 });
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!accountSid || !authToken) {
    return NextResponse.json({ error: "Twilio not configured" }, { status: 503 });
  }

  try {
    const client = twilio(accountSid, authToken);
    const participant = await client.conferences(conferenceSid).participants.create({
      from: callerId,
      to: toE164,
    });
    return NextResponse.json({ ok: true, participantCallSid: participant.callSid ?? null });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[workspace/phone/conference/add-participant]", msg);
    return NextResponse.json({ error: "Twilio add participant failed", detail: msg.slice(0, 200) }, { status: 502 });
  }
}
