import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";

import { supabaseAdmin } from "@/lib/admin";
import {
  conferenceStatusCallbackAttrs,
  inboundConferenceRoomName,
  staffUserIdFromClientCallParams,
  verifyInboundStaffConnectToken,
} from "@/lib/phone/inbound-browser-conference";
import { mergeSoftphoneConferenceMetadata } from "@/lib/phone/merge-softphone-conference-metadata";
import { escapeXml } from "@/lib/twilio/softphone-conference";
import { logTwilioVoiceTrace, summarizeTwimlResponse } from "@/lib/twilio/twilio-voice-trace-log";
import { parseVerifiedTwilioFormBody } from "@/lib/twilio/verify-form-post";

const LOG_TAG = "inbound-staff-connect";

/**
 * Twilio `url` on inbound `<Client>` after staff answers: join customer + browser in one conference.
 * Parent PSTN leg is updated via REST; browser leg gets Conference TwiML (endConferenceOnExit=false).
 */
export async function POST(req: NextRequest) {
  const parsed = await parseVerifiedTwilioFormBody(req);
  if (!parsed.ok) {
    return parsed.response;
  }

  const token = req.nextUrl.searchParams.get("token");
  const payload = verifyInboundStaffConnectToken(token);
  const staffCallSid = parsed.params.CallSid?.trim() ?? "";
  const parentFromParams = (parsed.params.ParentCallSid ?? "").trim();
  const parentCallSid =
    payload?.parent?.startsWith("CA") ? payload.parent : parentFromParams.startsWith("CA") ? parentFromParams : "";
  const toRaw = typeof parsed.params.To === "string" ? parsed.params.To : "";

  if (!parentCallSid || !staffCallSid.startsWith("CA")) {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Hangup/></Response>`;
    return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }

  const staffUserId = staffUserIdFromClientCallParams({
    toRaw,
    tokenStaffUserId: payload?.staff,
  });
  const publicBase = process.env.TWILIO_PUBLIC_BASE_URL?.trim().replace(/\/$/, "") || "";
  const room = inboundConferenceRoomName(parentCallSid);
  const confAttrs = conferenceStatusCallbackAttrs(publicBase);

  console.log(
    JSON.stringify({
      tag: LOG_TAG,
      event: "staff_answered_join_conference",
      parent_call_sid: parentCallSid,
      staff_call_sid: staffCallSid,
      room: room.slice(0, 48),
      staff_user_id: staffUserId,
    })
  );

  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (accountSid && authToken && parentCallSid.startsWith("CA")) {
    const parentTwiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>
    <Conference beep="false" startConferenceOnEnter="true" endConferenceOnExit="false" participantLabel="customer"${confAttrs}>${escapeXml(
      room
    )}</Conference>
  </Dial>
</Response>`.trim();
    try {
      const client = twilio(accountSid, authToken);
      await client.calls(parentCallSid).update({ twiml: parentTwiml });
    } catch (e) {
      console.warn(`[${LOG_TAG}] parent_conference_redirect_failed`, e instanceof Error ? e.message : e);
    }
  }

  const mergeResult = await mergeSoftphoneConferenceMetadata(supabaseAdmin, parentCallSid, {
    friendly_name: room,
    mode: "conference",
    direction: "inbound",
    pstn_call_sid: parentCallSid,
    client_call_sid: staffCallSid,
    ...(staffUserId ? {} : {}),
  });
  if (!mergeResult.ok) {
    console.warn(`[${LOG_TAG}] metadata_merge_failed`, mergeResult.error);
  }

  if (staffUserId && mergeResult.ok) {
    const row = await supabaseAdmin
      .from("phone_calls")
      .select("id, metadata")
      .eq("external_call_id", parentCallSid)
      .maybeSingle();
    if (row.data?.id) {
      const meta =
        row.data.metadata && typeof row.data.metadata === "object" && !Array.isArray(row.data.metadata)
          ? (row.data.metadata as Record<string, unknown>)
          : {};
      meta.staff_user_id = staffUserId;
      await supabaseAdmin.from("phone_calls").update({ metadata: meta }).eq("id", row.data.id);
    }
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial>
    <Conference beep="false" startConferenceOnEnter="true" endConferenceOnExit="false" participantLabel="staff"${confAttrs}>${escapeXml(
      room
    )}</Conference>
  </Dial>
</Response>`.trim();

  logTwilioVoiceTrace({
    route: "POST /api/twilio/voice/inbound-staff-connect",
    client_call_sid: staffCallSid,
    pstn_call_sid: parentCallSid,
    ai_path_entered: false,
    softphone_bypass_path_entered: true,
    twiml_summary: summarizeTwimlResponse(xml),
    branch: "inbound_browser_staff_join_conference",
    parent_call_sid: parentCallSid,
    from_raw: typeof parsed.params.From === "string" ? parsed.params.From : null,
    to_raw: toRaw,
  });

  return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
}
