import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { logMoveToCellEvent } from "@/lib/phone/move-to-cell-events";
import {
  formatMoveToCellFailureMessage,
  moveToCellFailureReason,
} from "@/lib/phone/move-to-cell-failure-messages";
import { markMoveToCellFailed, mergeMoveToCellMetadata } from "@/lib/phone/move-to-cell-metadata";
import { verifyMoveToCellToken } from "@/lib/phone/move-to-cell-token";
import { escapeXml } from "@/lib/twilio/softphone-conference";
import { parseVerifiedTwilioFormBody } from "@/lib/twilio/verify-form-post";

const LOG_TAG = "move-to-cell";

/**
 * Gather result: digit 1 joins the active conference; otherwise hang up (browser stays on call).
 */
export async function POST(req: NextRequest) {
  const parsed = await parseVerifiedTwilioFormBody(req);
  if (!parsed.ok) {
    return parsed.response;
  }

  const token = req.nextUrl.searchParams.get("token");
  const payload = verifyMoveToCellToken(token);
  const digits = (parsed.params.Digits ?? "").trim();
  const callSid = parsed.params.CallSid?.trim() ?? null;

  if (!payload) {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`;
    return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }

  if (digits !== "1") {
    const lastError = moveToCellFailureReason({ source: "press_1" });
    const userError = formatMoveToCellFailureMessage(lastError);
    console.log(
      JSON.stringify({
        tag: LOG_TAG,
        event: "move_to_cell_failed_exact_reason",
        reason: lastError,
        user_error: userError,
        sub_event: "staff_confirm_rejected_or_timeout",
        client_call_sid: payload.client_call_sid,
        cell_call_sid: callSid,
        digits: digits || null,
      })
    );
    await markMoveToCellFailed(supabaseAdmin, payload.client_call_sid, {
      last_error: lastError,
      failure_reason: lastError,
      cell_call_sid: callSid?.startsWith("CA") ? callSid : undefined,
    });
    await logMoveToCellEvent(supabaseAdmin, payload.client_call_sid, "move_to_cell_failed", {
      reason: "press_1",
      cell_call_sid: callSid,
      failure_reason: lastError,
    });
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`;
    return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }

  const room = payload.conference_friendly_name.trim();
  const publicBase = process.env.TWILIO_PUBLIC_BASE_URL?.trim().replace(/\/$/, "") || "";
  const joinUrl = `${publicBase}/api/twilio/voice/active-call/move-to-cell/join/${encodeURIComponent(room)}`;
  const confEvents = publicBase
    ? ` statusCallback="${escapeXml(`${publicBase}/api/twilio/voice/softphone-conference-events`)}" statusCallbackMethod="POST" statusCallbackEvent="join leave mute hold"`
    : "";

  await logMoveToCellEvent(supabaseAdmin, payload.client_call_sid, "move_to_cell_confirmed", {
    cell_call_sid: callSid,
    conference_sid: payload.conference_sid,
  });

  console.log(
    JSON.stringify({
      tag: LOG_TAG,
      event: "staff_accepted_join_conference",
      client_call_sid: payload.client_call_sid,
      room: room.slice(0, 48),
      cell_call_sid: callSid,
    })
  );

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>
    <Conference beep="false" startConferenceOnEnter="true" endConferenceOnExit="false" participantLabel="staff_cell"${confEvents}>${escapeXml(
      room
    )}</Conference>
  </Dial>
</Response>`.trim();

  return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
}
