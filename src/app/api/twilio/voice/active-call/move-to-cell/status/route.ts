import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { logMoveToCellEvent } from "@/lib/phone/move-to-cell-events";
import { mergeMoveToCellMetadata } from "@/lib/phone/move-to-cell-metadata";
import { verifyMoveToCellToken } from "@/lib/phone/move-to-cell-token";
import { parseVerifiedTwilioFormBody } from "@/lib/twilio/verify-form-post";

const LOG_TAG = "move-to-cell";
const FAILURE_STATUSES = new Set(["busy", "no-answer", "failed", "canceled"]);

/**
 * Staff cell leg status — mark move-to-cell failed when the cell never joins; browser stays connected.
 */
export async function POST(req: NextRequest) {
  const parsed = await parseVerifiedTwilioFormBody(req);
  if (!parsed.ok) {
    return parsed.response;
  }

  const token = req.nextUrl.searchParams.get("token");
  const payload = verifyMoveToCellToken(token);
  if (!payload) {
    return new NextResponse("OK", { status: 200 });
  }

  const callStatus = (parsed.params.CallStatus ?? "").trim().toLowerCase();
  const callSid = parsed.params.CallSid?.trim() ?? null;

  if (!FAILURE_STATUSES.has(callStatus)) {
    return new NextResponse("OK", { status: 200 });
  }

  console.log(
    JSON.stringify({
      tag: LOG_TAG,
      event: "cell_leg_terminal_failure",
      client_call_sid: payload.client_call_sid,
      cell_call_sid: callSid,
      call_status: callStatus,
    })
  );

  await mergeMoveToCellMetadata(supabaseAdmin, payload.client_call_sid, {
    status: "failed",
    last_error: callStatus,
    cell_call_sid: callSid?.startsWith("CA") ? callSid : undefined,
  });
  await logMoveToCellEvent(supabaseAdmin, payload.client_call_sid, "move_to_cell_failed", {
    reason: "cell_leg_status",
    call_status: callStatus,
    cell_call_sid: callSid,
  });

  return new NextResponse("OK", { status: 200 });
}
