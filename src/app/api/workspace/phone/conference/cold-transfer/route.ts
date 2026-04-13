import { NextResponse } from "next/server";
import twilio from "twilio";

import { supabaseAdmin } from "@/lib/admin";
import { isValidE164 } from "@/lib/softphone/phone-number";
import { canAccessWorkspacePhone, getStaffProfile } from "@/lib/staff-profile";
import { escapeXml } from "@/lib/twilio/softphone-conference";
import type { SoftphoneConferenceMeta } from "@/lib/twilio/softphone-conference";

/**
 * Cold transfer: redirect the PSTN participant to a new destination; staff should hang up the Client leg after success.
 * Uses Twilio REST Calls.update with inline TwiML (no marketplace plugins).
 */
export async function POST(req: Request) {
  const staff = await getStaffProfile();
  if (!staff || !canAccessWorkspacePhone(staff)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { toE164?: string; pstnCallSid?: string; callSid?: string };
  try {
    body = (await req.json()) as { toE164?: string; pstnCallSid?: string; callSid?: string };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const toE164 = typeof body.toE164 === "string" ? body.toE164.trim() : "";
  if (!isValidE164(toE164)) {
    return NextResponse.json({ error: "toE164 must be valid E.164" }, { status: 400 });
  }

  let pstnCallSid = typeof body.pstnCallSid === "string" && body.pstnCallSid.startsWith("CA") ? body.pstnCallSid.trim() : "";

  if (!pstnCallSid && typeof body.callSid === "string" && body.callSid.startsWith("CA")) {
    const { data: row } = await supabaseAdmin
      .from("phone_calls")
      .select("metadata")
      .eq("external_call_id", body.callSid.trim())
      .maybeSingle();
    const meta = row?.metadata as Record<string, unknown> | undefined;
    const sc = meta?.softphone_conference as SoftphoneConferenceMeta | undefined;
    pstnCallSid = sc?.pstn_call_sid?.trim() || "";
  }

  if (!pstnCallSid.startsWith("CA")) {
    return NextResponse.json(
      { error: "PSTN leg unknown — pass pstnCallSid or Client callSid with conference metadata." },
      { status: 400 }
    );
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

  const twiml = `<?xml version="1.0" encoding="UTF-8"?><Response><Dial callerId="${escapeXml(callerId)}"><Number>${escapeXml(
    toE164
  )}</Number></Dial></Response>`;

  try {
    const client = twilio(accountSid, authToken);
    await client.calls(pstnCallSid).update({ twiml });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[workspace/phone/conference/cold-transfer]", msg);
    return NextResponse.json({ error: "Twilio transfer failed", detail: msg.slice(0, 200) }, { status: 502 });
  }

  return NextResponse.json({ ok: true, hangupClientSuggested: true });
}
