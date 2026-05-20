import { NextResponse } from "next/server";
import twilio from "twilio";

import { supabaseAdmin } from "@/lib/admin";
import { computeConferenceGating } from "@/lib/phone/conference-gating";
import { logMoveToCellEvent } from "@/lib/phone/move-to-cell-events";
import { mergeMoveToCellMetadata } from "@/lib/phone/move-to-cell-metadata";
import { mintMoveToCellToken } from "@/lib/phone/move-to-cell-token";
import { readMoveToCellMeta } from "@/lib/phone/move-to-cell-types";
import { upsertPhoneCallFromWebhook } from "@/lib/phone/log-call";
import { findPhoneCallRowByTwilioCallSid } from "@/lib/phone/phone-call-lookup-by-call-sid";
import { resolveStaffOutboundCellE164 } from "@/lib/phone/staff-outbound-cell";
import { resolveOutboundStaffRingSeconds } from "@/lib/phone/outbound-pstn-bridge-config";
import { isValidE164 } from "@/lib/softphone/phone-number";
import {
  canAccessWorkspacePhone,
  resolveStaffProfileForWorkspacePhoneApi,
} from "@/lib/staff-profile";
import type { SoftphoneConferenceMeta } from "@/lib/twilio/softphone-conference";
import { inboundConferenceRoomName } from "@/lib/phone/inbound-browser-conference";
import { softphoneConferenceRoomName } from "@/lib/twilio/softphone-conference";

export const dynamic = "force-dynamic";

const LOG_TAG = "move-to-cell";

type RequestBody = {
  callSid?: string;
  callSessionId?: string;
  conferenceSid?: string;
  conferenceFriendlyName?: string;
  staffUserId?: string;
};

/**
 * Mid-call: ring staff cell with press-1, then join the active softphone conference and drop the browser leg.
 * Requires a conference-backed call (outbound `TWILIO_SOFTPHONE_USE_CONFERENCE` or inbound browser conference).
 */
export async function POST(req: Request) {
  const staff = await resolveStaffProfileForWorkspacePhoneApi(req);
  if (!staff || !canAccessWorkspacePhone(staff)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const staffCell = resolveStaffOutboundCellE164(staff);
  if (!staffCell) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "No staff cell number configured. Add sms_notify_phone on your staff profile or set TWILIO_OUTBOUND_DEFAULT_STAFF_E164.",
      },
      { status: 400 }
    );
  }

  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const requestedStaffId = typeof body.staffUserId === "string" ? body.staffUserId.trim() : "";
  if (requestedStaffId && requestedStaffId !== staff.user_id) {
    return NextResponse.json({ ok: false, error: "staffUserId does not match signed-in user" }, { status: 403 });
  }

  const clientCallSid =
    typeof body.callSid === "string" && body.callSid.startsWith("CA")
      ? body.callSid.trim()
      : typeof body.callSessionId === "string" && body.callSessionId.startsWith("CA")
        ? body.callSessionId.trim()
        : "";
  if (!clientCallSid) {
    return NextResponse.json({ ok: false, error: "callSid (Client leg) required" }, { status: 400 });
  }

  const row = await findPhoneCallRowByTwilioCallSid(supabaseAdmin, clientCallSid);
  if (!row) {
    return NextResponse.json({ ok: false, error: "Active call not found" }, { status: 404 });
  }

  const meta =
    row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
      ? (row.metadata as Record<string, unknown>)
      : {};
  const rowStaffId = typeof meta.staff_user_id === "string" ? meta.staff_user_id.trim() : "";
  if (rowStaffId && rowStaffId !== staff.user_id) {
    return NextResponse.json({ ok: false, error: "You may only move your own active calls" }, { status: 403 });
  }

  const existing = readMoveToCellMeta(meta);
  if (existing?.status === "connected_on_cell") {
    return NextResponse.json(
      { ok: false, error: "Call is already connected on your cell.", status: existing.status },
      { status: 409 }
    );
  }
  if (existing && (existing.status === "ringing" || existing.status === "press_1")) {
    return NextResponse.json(
      { ok: false, error: "Move to cell already in progress", status: existing.status },
      { status: 409 }
    );
  }

  const sc = meta.softphone_conference as SoftphoneConferenceMeta | undefined;
  const metadataMergeKey = row.external_call_id;
  const browserLegSid =
    typeof sc?.client_call_sid === "string" && sc.client_call_sid.startsWith("CA")
      ? sc.client_call_sid.trim()
      : clientCallSid;
  const direction = row.direction === "inbound" ? "inbound" : "outbound";
  const gating = computeConferenceGating({
    clientCallSid: browserLegSid,
    callDirection: direction,
    moveToCellStatus: existing?.status ?? null,
    softphoneConference: sc
      ? {
          mode: sc.mode ?? "conference",
          conference_sid: sc.conference_sid,
          pstn_call_sid: sc.pstn_call_sid,
          direction: sc.direction ?? direction,
          client_call_sid: sc.client_call_sid ?? browserLegSid,
        }
      : null,
  });

  let conferenceSid =
    typeof body.conferenceSid === "string" && body.conferenceSid.startsWith("CF")
      ? body.conferenceSid.trim()
      : gating.conference_sid ?? "";
  const friendlyFromBody =
    typeof body.conferenceFriendlyName === "string" ? body.conferenceFriendlyName.trim() : "";
  const friendlyName =
    friendlyFromBody ||
    sc?.friendly_name?.trim() ||
    (direction === "inbound"
      ? inboundConferenceRoomName(metadataMergeKey)
      : softphoneConferenceRoomName(browserLegSid));

  if (!gating.can_move_to_cell || !conferenceSid) {
    console.log(
      JSON.stringify({
        tag: LOG_TAG,
        event: "request_rejected_not_eligible",
        client_call_sid: browserLegSid,
        call_direction: direction,
        conference_sid: conferenceSid || null,
        disabled_codes: gating.move_to_cell_disabled_codes,
        disabled_reason: gating.move_to_cell_disabled_reason,
      })
    );
    return NextResponse.json(
      {
        ok: false,
        error:
          gating.move_to_cell_disabled_reason ??
          "Move to cell requires an active conference call (answer on the browser softphone first).",
        blockers: gating.blockers,
        disabled_codes: gating.move_to_cell_disabled_codes,
        fallback_available: false,
      },
      { status: 409 }
    );
  }

  const callerId = process.env.TWILIO_SOFTPHONE_CALLER_ID_E164?.trim() || "";
  if (!callerId || !isValidE164(callerId)) {
    return NextResponse.json({ ok: false, error: "TWILIO_SOFTPHONE_CALLER_ID_E164 not configured" }, { status: 503 });
  }

  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const publicBase = process.env.TWILIO_PUBLIC_BASE_URL?.trim().replace(/\/$/, "");
  if (!accountSid || !authToken || !publicBase) {
    return NextResponse.json({ ok: false, error: "Twilio not configured" }, { status: 503 });
  }

  const customerCallSid =
    typeof sc?.pstn_call_sid === "string" && sc.pstn_call_sid.startsWith("CA")
      ? sc.pstn_call_sid.trim()
      : direction === "inbound"
        ? metadataMergeKey
        : null;

  let token: string;
  try {
    token = mintMoveToCellToken({
      staff: staff.user_id,
      client_call_sid: browserLegSid,
      conference_sid: conferenceSid,
      conference_friendly_name: friendlyName,
      presentation_cli: callerId,
    });
  } catch {
    return NextResponse.json({ ok: false, error: "Signing secret not configured" }, { status: 503 });
  }

  const staffScreenUrl = `${publicBase}/api/twilio/voice/active-call/move-to-cell/staff-screen?token=${encodeURIComponent(token)}`;
  const statusUrl = `${publicBase}/api/twilio/voice/active-call/move-to-cell/status?token=${encodeURIComponent(token)}`;
  const ringSec = resolveOutboundStaffRingSeconds();

  try {
    const client = twilio(accountSid, authToken);
    const cellCall = await client.calls.create({
      to: staffCell,
      from: callerId,
      url: staffScreenUrl,
      method: "POST",
      timeout: ringSec,
      statusCallback: statusUrl,
      statusCallbackMethod: "POST",
      statusCallbackEvent: ["initiated", "ringing", "answered", "completed"],
    });
    const cellCallSid = typeof cellCall.sid === "string" ? cellCall.sid : null;

    if (cellCallSid) {
      await upsertPhoneCallFromWebhook(supabaseAdmin, {
        external_call_id: cellCallSid,
        direction: "outbound",
        from_e164: callerId,
        to_e164: staffCell,
        status: "initiated",
        event_type: "move_to_cell.bridge_leg_initiated",
        metadata: {
          source: "move_to_cell_bridge",
          leg_role: "internal_transfer",
          parent_client_call_sid: clientCallSid,
          conference_sid: conferenceSid,
          staff_user_id: staff.user_id,
        },
      });
    }

    const mergeResult = await mergeMoveToCellMetadata(supabaseAdmin, metadataMergeKey, {
      status: "ringing",
      staff_user_id: staff.user_id,
      staff_cell_e164: staffCell,
      conference_sid: conferenceSid,
      conference_friendly_name: friendlyName,
      client_call_sid: browserLegSid,
      customer_call_sid: customerCallSid,
      cell_call_sid: cellCallSid,
      direction,
      lead_id: typeof meta.lead_id === "string" ? meta.lead_id : null,
      contact_id: typeof meta.contact_id === "string" ? meta.contact_id : null,
      patient_id: typeof meta.patient_id === "string" ? meta.patient_id : null,
      requested_at: new Date().toISOString(),
      last_error: null,
    });
    if (!mergeResult.ok) {
      console.warn(`[${LOG_TAG}] metadata_merge_failed`, mergeResult.error);
    }

    await logMoveToCellEvent(supabaseAdmin, metadataMergeKey, "move_to_cell_requested", {
      conference_sid: conferenceSid,
      cell_call_sid: cellCallSid,
      staff_cell_tail: staffCell.replace(/\D/g, "").slice(-4),
    });
    await logMoveToCellEvent(supabaseAdmin, metadataMergeKey, "move_to_cell_ringing", {
      cell_call_sid: cellCallSid,
    });

    return NextResponse.json({
      ok: true,
      status: "ringing",
      cellCallSid,
      message: "Calling your cell… Press 1 when you answer to join the call.",
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(`[${LOG_TAG}] calls.create failed`, msg);
    await mergeMoveToCellMetadata(supabaseAdmin, metadataMergeKey, {
      status: "failed",
      last_error: msg.slice(0, 200),
    });
    await logMoveToCellEvent(supabaseAdmin, metadataMergeKey, "move_to_cell_failed", {
      reason: "calls_create",
      detail: msg,
    });
    return NextResponse.json(
      {
        ok: false,
        error: "Cell transfer failed — browser call is still connected.",
        detail: msg.slice(0, 200),
      },
      { status: 502 }
    );
  }
}
