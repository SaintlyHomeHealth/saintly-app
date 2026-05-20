import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import {
  formatMoveToCellFailureMessage,
  moveToCellFailureReason,
} from "@/lib/phone/move-to-cell-failure-messages";
import { logMoveToCellEvent } from "@/lib/phone/move-to-cell-events";
import { markMoveToCellFailed } from "@/lib/phone/move-to-cell-metadata";
import { verifyMoveToCellToken } from "@/lib/phone/move-to-cell-token";
import { readMoveToCellUiState } from "@/lib/phone/move-to-cell-types";
import { findPhoneCallRowByTwilioCallSid } from "@/lib/phone/phone-call-lookup-by-call-sid";
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

  console.log(
    JSON.stringify({
      tag: LOG_TAG,
      event: "cell_status_callback_received",
      client_call_sid: payload.client_call_sid,
      cell_call_sid: callSid,
      call_status: callStatus,
    })
  );

  const row = await findPhoneCallRowByTwilioCallSid(supabaseAdmin, payload.client_call_sid);
  const uiState = readMoveToCellUiState(row?.metadata ?? null);
  const activeMove =
    uiState?.status === "ringing" || uiState?.status === "press_1" || uiState?.status === "failed";

  const shouldFail =
    FAILURE_STATUSES.has(callStatus) ||
    (callStatus === "completed" &&
      uiState?.status !== "connected_on_cell" &&
      (uiState?.status === "ringing" || uiState?.status === "press_1"));

  if (!shouldFail) {
    return new NextResponse("OK", { status: 200 });
  }

  const lastError = moveToCellFailureReason({
    source: FAILURE_STATUSES.has(callStatus) ? "cell_leg_status" : "completed_without_join",
    callStatus: FAILURE_STATUSES.has(callStatus) ? callStatus : "completed_without_join",
  });
  const userError = formatMoveToCellFailureMessage(lastError);

  console.log(
    JSON.stringify({
      tag: LOG_TAG,
      event: "move_to_cell_failed_exact_reason",
      reason: lastError,
      user_error: userError,
      client_call_sid: payload.client_call_sid,
      cell_call_sid: callSid,
      call_status: callStatus,
      prior_move_status: uiState?.status ?? null,
      phone_call_found: Boolean(row?.id),
    })
  );

  if (activeMove || FAILURE_STATUSES.has(callStatus)) {
    await markMoveToCellFailed(supabaseAdmin, payload.client_call_sid, {
      last_error: lastError,
      failure_reason: lastError,
      cell_call_sid: callSid?.startsWith("CA") ? callSid : undefined,
    });
    await logMoveToCellEvent(supabaseAdmin, payload.client_call_sid, "move_to_cell_failed", {
      reason: "cell_leg_status",
      call_status: callStatus,
      cell_call_sid: callSid,
      failure_reason: lastError,
    });
  }

  return new NextResponse("OK", { status: 200 });
}
