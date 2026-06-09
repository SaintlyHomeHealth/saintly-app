import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import {
  buildStaffConferenceJoinTwiml,
  inboundBrowserConferenceEnabled,
  inboundConferenceRoomName,
  legacyInboundStaffBridgeTwiml,
  redirectCustomerIntoInboundConference,
  staffUserIdFromClientCallParams,
  verifyInboundStaffConnectToken,
} from "@/lib/phone/inbound-browser-conference";
import { mergeSoftphoneConferenceMetadata } from "@/lib/phone/merge-softphone-conference-metadata";
import { logTwilioVoiceTrace, summarizeTwimlResponse } from "@/lib/twilio/twilio-voice-trace-log";
import { parseVerifiedTwilioFormBody } from "@/lib/twilio/verify-form-post";

const LOG_TAG = "inbound-staff-connect";

function logConnect(event: string, payload: Record<string, unknown>) {
  console.log(JSON.stringify({ tag: LOG_TAG, event, ...payload }));
}

/**
 * Twilio `url` on inbound `<Client>` after staff answers.
 * Customer (parent PSTN) leg MUST join the conference before staff leg TwiML is returned.
 */
export async function POST(req: NextRequest) {
  const parsed = await parseVerifiedTwilioFormBody(req);
  if (!parsed.ok) {
    return parsed.response;
  }

  const p = parsed.params;
  const token = req.nextUrl.searchParams.get("token");
  const payload = verifyInboundStaffConnectToken(token);
  const staffCallSid = (p.CallSid ?? "").trim();
  const parentFromParams = (p.ParentCallSid ?? "").trim();
  const tokenParentSid = payload?.parent?.trim() ?? "";
  const customerCallSid = tokenParentSid.startsWith("CA") ? tokenParentSid : "";
  const toRaw = typeof p.To === "string" ? p.To : "";
  const fromRaw = typeof p.From === "string" ? p.From : "";

  logConnect("request_received", {
    inbound_conference_enabled: inboundBrowserConferenceEnabled(),
    staff_call_sid: staffCallSid || null,
    parent_call_sid_param: parentFromParams || null,
    token_parent_call_sid: tokenParentSid || null,
    customer_call_sid_resolved: customerCallSid || null,
    parent_sid_matches_token:
      tokenParentSid && parentFromParams ? tokenParentSid === parentFromParams : null,
    from_tail: fromRaw.replace(/\D/g, "").slice(-4) || null,
    to_client: toRaw.toLowerCase().startsWith("client:") ? toRaw.slice(0, 24) : toRaw.slice(0, 24),
  });

  if (!inboundBrowserConferenceEnabled()) {
    logConnect("fallback_legacy_inbound_conference_disabled", {
      staff_call_sid: staffCallSid || null,
      customer_call_sid: customerCallSid || null,
    });
    const xml = legacyInboundStaffBridgeTwiml();
    return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }

  if (!payload || !customerCallSid || !staffCallSid.startsWith("CA")) {
    logConnect("fallback_legacy_invalid_token_or_sids", {
      has_token: Boolean(payload),
      customerCallSid: customerCallSid || null,
      staffCallSid: staffCallSid || null,
    });
    const xml = legacyInboundStaffBridgeTwiml();
    return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }

  if (staffCallSid === customerCallSid) {
    logConnect("reject_staff_equals_customer", { call_sid: staffCallSid });
    const xml = legacyInboundStaffBridgeTwiml();
    return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }

  if (parentFromParams && tokenParentSid && parentFromParams !== tokenParentSid) {
    logConnect("warn_parent_sid_mismatch", {
      parent_call_sid_param: parentFromParams,
      token_parent_call_sid: tokenParentSid,
      using_customer_sid: customerCallSid,
    });
  }

  const staffUserId = staffUserIdFromClientCallParams({
    toRaw,
    tokenStaffUserId: payload?.staff,
  });
  const publicBase = process.env.TWILIO_PUBLIC_BASE_URL?.trim().replace(/\/$/, "") || "";
  const room = inboundConferenceRoomName(customerCallSid);
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();

  logConnect("conference_room", {
    conference_friendly_name: room,
    staff_call_sid: staffCallSid,
    customer_call_sid: customerCallSid,
  });

  if (!accountSid || !authToken || !publicBase) {
    logConnect("reject_twilio_not_configured", { hasAccount: Boolean(accountSid), hasPublicBase: Boolean(publicBase) });
    return new NextResponse(legacyInboundStaffBridgeTwiml(), {
      status: 200,
      headers: { "Content-Type": "text/xml; charset=utf-8" },
    });
  }

  const redirect = await redirectCustomerIntoInboundConference({
    accountSid,
    authToken,
    customerCallSid,
    room,
    publicBase,
  });

  logConnect("parent_conference_redirect_result", {
    customer_call_sid: customerCallSid,
    conference_friendly_name: room,
    parent_update_ok: redirect.parentUpdateOk,
    customer_in_conference: redirect.customerInConference,
    conference_sid: redirect.conferenceSid,
    parent_status_before: redirect.parentStatusBefore,
    parent_status_after: redirect.parentStatusAfter,
    poll_attempts: redirect.pollAttempts,
    twilio_error_code: redirect.error?.code ?? null,
    twilio_error_status: redirect.error?.status ?? null,
    twilio_error_message: redirect.error?.message ?? null,
    twilio_more_info: redirect.error?.moreInfo ?? null,
  });

  if (!redirect.parentUpdateOk) {
    logConnect("fallback_legacy_direct_bridge", {
      reason: redirect.error?.message ?? "parent_conference_redirect_failed",
      staff_call_sid: staffCallSid,
      customer_call_sid: customerCallSid,
      customer_in_conference: redirect.customerInConference,
    });
    const xml = legacyInboundStaffBridgeTwiml();
    logTwilioVoiceTrace({
      route: "POST /api/twilio/voice/inbound-staff-connect",
      client_call_sid: staffCallSid,
      pstn_call_sid: customerCallSid,
      ai_path_entered: false,
      softphone_bypass_path_entered: true,
      twiml_summary: summarizeTwimlResponse(xml),
      branch: "legacy_bridge_fallback_parent_not_in_conference",
      parent_call_sid: customerCallSid,
      from_raw: fromRaw,
      to_raw: toRaw,
    });
    return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }

  if (!redirect.customerInConference) {
    logConnect("warn_customer_conference_poll_miss", {
      customer_call_sid: customerCallSid,
      conference_friendly_name: room,
      poll_attempts: redirect.pollAttempts,
      conference_sid: redirect.conferenceSid,
      note: "proceeding_with_staff_join_parent_redirect_ok",
    });
  }

  const mergeResult = await mergeSoftphoneConferenceMetadata(supabaseAdmin, customerCallSid, {
    friendly_name: room,
    mode: "conference",
    direction: "inbound",
    pstn_call_sid: customerCallSid,
    client_call_sid: staffCallSid,
    conference_sid: redirect.conferenceSid ?? undefined,
  });
  if (!mergeResult.ok) {
    console.warn(`[${LOG_TAG}] metadata_merge_failed`, mergeResult.error);
  }

  if (staffUserId) {
    const { data: row } = await supabaseAdmin
      .from("phone_calls")
      .select("id, metadata")
      .eq("external_call_id", customerCallSid)
      .maybeSingle();
    if (row?.id) {
      const meta =
        row.metadata && typeof row.metadata === "object" && !Array.isArray(row.metadata)
          ? (row.metadata as Record<string, unknown>)
          : {};
      meta.staff_user_id = staffUserId;
      meta.twilio_leg_map = {
        parent_call_sid: customerCallSid,
        last_leg_call_sid: staffCallSid,
        updated_at: new Date().toISOString(),
      };
      await supabaseAdmin.from("phone_calls").update({ metadata: meta }).eq("id", row.id);
    }
  }

  const xml = buildStaffConferenceJoinTwiml(room, publicBase);

  logConnect("staff_join_conference_twiml", {
    inbound_conference_enabled: true,
    staff_call_sid: staffCallSid,
    customer_call_sid: customerCallSid,
    conference_friendly_name: room,
    conference_sid: redirect.conferenceSid,
    move_to_cell_ready: Boolean(redirect.conferenceSid && staffCallSid && customerCallSid),
    customer_in_conference: redirect.customerInConference,
  });

  logTwilioVoiceTrace({
    route: "POST /api/twilio/voice/inbound-staff-connect",
    client_call_sid: staffCallSid,
    pstn_call_sid: customerCallSid,
    ai_path_entered: false,
    softphone_bypass_path_entered: true,
    twiml_summary: summarizeTwimlResponse(xml),
    branch: "inbound_browser_staff_join_conference_after_customer_confirmed",
    parent_call_sid: customerCallSid,
    from_raw: fromRaw,
    to_raw: toRaw,
  });

  return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
}
