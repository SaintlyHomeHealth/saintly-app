import { NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { endActiveWorkspaceConferenceCall } from "@/lib/phone/end-active-conference-call";
import { readMoveToCellMeta } from "@/lib/phone/move-to-cell-types";
import { findPhoneCallRowByTwilioCallSid } from "@/lib/phone/phone-call-lookup-by-call-sid";
import {
  canAccessWorkspacePhone,
  resolveStaffProfileForWorkspacePhoneApi,
} from "@/lib/staff-profile";

export const dynamic = "force-dynamic";

type RequestBody = {
  callSid?: string;
  conferenceSid?: string;
};

/**
 * End the active softphone conference (customer + staff_cell) from the workspace UI.
 * Used when move-to-cell is connected and the browser leg is already gone.
 */
export async function POST(req: Request) {
  const staff = await resolveStaffProfileForWorkspacePhoneApi(req);
  if (!staff || !canAccessWorkspacePhone(staff)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const callSid = typeof body.callSid === "string" && body.callSid.startsWith("CA") ? body.callSid.trim() : "";
  const conferenceSid =
    typeof body.conferenceSid === "string" && body.conferenceSid.startsWith("CF")
      ? body.conferenceSid.trim()
      : "";

  if (!callSid) {
    return NextResponse.json({ ok: false, error: "callSid required (Client leg CA…)" }, { status: 400 });
  }

  const row = await findPhoneCallRowByTwilioCallSid(supabaseAdmin, callSid);
  if (!row?.id) {
    return NextResponse.json({ ok: false, error: "phone_call not found" }, { status: 404 });
  }

  const moveToCell = readMoveToCellMeta(row.metadata);
  const sc = row.metadata?.softphone_conference;
  const confSid =
    conferenceSid ||
    moveToCell?.conference_sid?.trim() ||
    (sc && typeof sc === "object" && !Array.isArray(sc) && typeof (sc as { conference_sid?: string }).conference_sid === "string"
      ? (sc as { conference_sid: string }).conference_sid.trim()
      : "");

  if (!confSid.startsWith("CF")) {
    return NextResponse.json({ ok: false, error: "conferenceSid not found on this call" }, { status: 400 });
  }

  if (moveToCell?.status !== "connected_on_cell") {
    return NextResponse.json(
      { ok: false, error: "End conference is only available after move-to-cell is connected on cell." },
      { status: 409 }
    );
  }

  if (moveToCell.staff_user_id && moveToCell.staff_user_id !== staff.user_id) {
    return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
  }

  const result = await endActiveWorkspaceConferenceCall(supabaseAdmin, {
    lookupCallSid: callSid,
    conferenceSid: confSid,
    reason: "workspace_active_call_end_button",
  });

  return NextResponse.json({
    ok: result.ok,
    steps: result.steps,
    error: result.error,
    client_call_sid: result.client_call_sid,
    conference_sid: result.conference_sid,
  });
}
