import { NextRequest, NextResponse } from "next/server";
import twilio from "twilio";

import { supabaseAdmin } from "@/lib/admin";
import { mergeSoftphoneConferenceMetadata } from "@/lib/phone/merge-softphone-conference-metadata";
import { upsertPhoneCallFromWebhook } from "@/lib/phone/log-call";
import { isValidE164 } from "@/lib/softphone/phone-number";
import { parseStaffUserIdFromTwilioClientFrom } from "@/lib/softphone/twilio-client-identity";
import { escapeXml, softphoneConferenceRoomName } from "@/lib/twilio/softphone-conference";
import { logTwilioVoiceTrace, summarizeTwimlResponse } from "@/lib/twilio/twilio-voice-trace-log";
import { parseVerifiedTwilioFormBody } from "@/lib/twilio/verify-form-post";

/**
 * When `true`, outbound browser softphone uses Twilio Conference (Client + REST PSTN leg).
 * Set `TWILIO_SOFTPHONE_USE_CONFERENCE=true` after validation. Default keeps legacy `<Dial><Number>`.
 */
function useConferenceOutbound(): boolean {
  return process.env.TWILIO_SOFTPHONE_USE_CONFERENCE === "true";
}

/**
 * Creates the REST outbound leg into the conference room. Returns the PSTN CallSid from Twilio (authoritative).
 * Conference participant webhooks can confirm later; this must not depend on join event shape alone.
 */
async function createPstnLegIntoConference(input: {
  toE164: string;
  fromE164: string;
  roomName: string;
}): Promise<string | null> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const publicBase = process.env.TWILIO_PUBLIC_BASE_URL?.trim().replace(/\/$/, "");
  if (!accountSid || !authToken || !publicBase) {
    console.error("[twilio/voice/softphone] PSTN leg skipped — missing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_PUBLIC_BASE_URL");
    return null;
  }
  const joinUrl = `${publicBase}/api/twilio/voice/softphone-pstn-join/${encodeURIComponent(input.roomName)}`;
  try {
    const client = twilio(accountSid, authToken);
    const call = await client.calls.create({
      to: input.toE164,
      from: input.fromE164,
      url: joinUrl,
      method: "POST",
    });
    const pstnSid = typeof call.sid === "string" && call.sid.startsWith("CA") ? call.sid : null;
    if (pstnSid) {
      console.log("[twilio/voice/softphone] PSTN leg created via REST (calls.create)", {
        pstnLeg: `${pstnSid.slice(0, 10)}…`,
        room: input.roomName.slice(0, 24),
      });
    }
    return pstnSid;
  } catch (e) {
    console.error("[twilio/voice/softphone] PSTN conference leg create failed", e);
    return null;
  }
}

const NOT_CONFIGURED =
  "We are sorry, outbound calling is not fully configured. Please contact your administrator.";

const INVALID_NUMBER = "The number you dialed is not valid. Please check and try again.";

export async function POST(req: NextRequest) {
  const parsed = await parseVerifiedTwilioFormBody(req);
  if (!parsed.ok) {
    return parsed.response;
  }

  const params = parsed.params;
  const callSid = params.CallSid?.trim();
  const fromRaw = params.From?.trim();
  const toRaw = params.To?.trim();
  const parentCallSid = typeof params.ParentCallSid === "string" ? params.ParentCallSid.trim() : null;

  if (toRaw?.toLowerCase().startsWith("client:")) {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
    logTwilioVoiceTrace({
      route: "POST /api/twilio/voice/softphone",
      client_call_sid: callSid ?? null,
      pstn_call_sid: null,
      ai_path_entered: false,
      softphone_bypass_path_entered: true,
      twiml_summary: summarizeTwimlResponse(xml),
      branch: "empty_response_to_client_uri",
      parent_call_sid: parentCallSid,
      from_raw: fromRaw,
      to_raw: toRaw,
    });
    return new NextResponse(xml, {
      status: 200,
      headers: { "Content-Type": "text/xml; charset=utf-8" },
    });
  }

  if (!callSid || !fromRaw) {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">${escapeXml(
      "We could not start this call."
    )}</Say></Response>`;
    logTwilioVoiceTrace({
      route: "POST /api/twilio/voice/softphone",
      client_call_sid: callSid ?? null,
      pstn_call_sid: null,
      ai_path_entered: false,
      softphone_bypass_path_entered: true,
      twiml_summary: summarizeTwimlResponse(xml),
      branch: "missing_callsid_or_from",
      parent_call_sid: parentCallSid,
      from_raw: fromRaw,
      to_raw: toRaw,
    });
    return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }

  // Outbound PSTN caller ID: Saintly Twilio DID only (`TWILIO_SOFTPHONE_CALLER_ID_E164`). Do not reuse
  // `TWILIO_VOICE_RING_E164` (inbound ring-to number); that is often a staff cell and was wrongly used as fallback.
  const callerId = process.env.TWILIO_SOFTPHONE_CALLER_ID_E164?.trim() || "";

  if (!callerId || !isValidE164(callerId)) {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">${escapeXml(
      NOT_CONFIGURED
    )}</Say></Response>`;
    logTwilioVoiceTrace({
      route: "POST /api/twilio/voice/softphone",
      client_call_sid: callSid,
      pstn_call_sid: null,
      ai_path_entered: false,
      softphone_bypass_path_entered: true,
      twiml_summary: summarizeTwimlResponse(xml),
      branch: "caller_id_not_configured",
      parent_call_sid: parentCallSid,
      from_raw: fromRaw,
      to_raw: toRaw,
    });
    return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }

  if (toRaw?.toLowerCase().startsWith("client:")) {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
    logTwilioVoiceTrace({
      route: "POST /api/twilio/voice/softphone",
      client_call_sid: callSid,
      pstn_call_sid: null,
      ai_path_entered: false,
      softphone_bypass_path_entered: true,
      twiml_summary: summarizeTwimlResponse(xml),
      branch: "empty_response_to_client_uri_late",
      parent_call_sid: parentCallSid,
      from_raw: fromRaw,
      to_raw: toRaw,
    });
    return new NextResponse(xml, {
      status: 200,
      headers: { "Content-Type": "text/xml; charset=utf-8" },
    });
  }

  const staffUserId = parseStaffUserIdFromTwilioClientFrom(fromRaw);
  const startedAt = new Date().toISOString();
  const conferenceMode = useConferenceOutbound() && Boolean(toRaw && isValidE164(toRaw));
  const roomName = conferenceMode ? softphoneConferenceRoomName(callSid) : "";

  const logResult = await upsertPhoneCallFromWebhook(supabaseAdmin, {
    external_call_id: callSid,
    direction: "outbound",
    from_e164: callerId,
    to_e164: toRaw,
    status: "initiated",
    event_type: "softphone.outbound_twiml",
    started_at: startedAt,
    metadata: {
      source: "twilio_voice_softphone",
      twilio_client_from: fromRaw,
      ...(staffUserId ? { staff_user_id: staffUserId } : {}),
      ...(conferenceMode
        ? {
            softphone_conference: {
              friendly_name: roomName,
              mode: "conference",
            },
          }
        : {}),
    },
  });

  if (!logResult.ok) {
    console.error("[twilio/voice/softphone] phone log failed:", logResult.error);
  }

  const publicBase = process.env.TWILIO_PUBLIC_BASE_URL?.trim().replace(/\/$/, "");
  const statusCallbackUrl = publicBase ? `${publicBase}/api/twilio/voice/status` : "";
  const dialActionUrl = publicBase ? `${publicBase}/api/twilio/voice/softphone-dial-result` : "";

  if (conferenceMode && toRaw && isValidE164(toRaw)) {
    const confStatus = publicBase
      ? ` statusCallback="${escapeXml(`${publicBase}/api/twilio/voice/softphone-conference-events`)}" statusCallbackMethod="POST" statusCallbackEvent="join leave mute hold start end"`
      : "";
    const dialAttrs = publicBase
      ? ` timeout="55" action="${escapeXml(dialActionUrl)}" method="POST"`
      : ` timeout="55"`;

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial${dialAttrs}>
    <Conference beep="false" startConferenceOnEnter="true" endConferenceOnExit="false" participantLabel="staff"${confStatus}>${escapeXml(
      roomName
    )}</Conference>
  </Dial>
</Response>`.trim();

    const pstnLegSid = await createPstnLegIntoConference({
      toE164: toRaw,
      fromE164: callerId,
      roomName,
    });

    if (pstnLegSid && callSid) {
      const merged = await mergeSoftphoneConferenceMetadata(supabaseAdmin, callSid, {
        pstn_call_sid: pstnLegSid,
        friendly_name: roomName,
      });
      if (!merged.ok) {
        console.warn("[twilio/voice/softphone] merge PSTN sid after REST create failed", merged.error);
      } else {
        console.log("[twilio/voice/softphone] metadata merge after PSTN REST create", {
          clientLeg: `${callSid.slice(0, 10)}…`,
          pstnLeg: `${pstnLegSid.slice(0, 10)}…`,
        });
      }
    }

    logTwilioVoiceTrace({
      route: "POST /api/twilio/voice/softphone",
      client_call_sid: callSid,
      pstn_call_sid: pstnLegSid,
      ai_path_entered: false,
      softphone_bypass_path_entered: true,
      twiml_summary: summarizeTwimlResponse(xml),
      branch: "conference_outbound_client_plus_pstn_rest_leg",
      parent_call_sid: parentCallSid,
      from_raw: fromRaw,
      to_raw: toRaw,
    });
    return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }

  const dialAttrs = publicBase
    ? ` answerOnBridge="true" timeout="55" callerId="${escapeXml(
        callerId
      )}" action="${escapeXml(dialActionUrl)}" method="POST" statusCallback="${escapeXml(
        statusCallbackUrl
      )}" statusCallbackMethod="POST" statusCallbackEvent="initiated ringing answered completed"`
    : ` answerOnBridge="true" timeout="55" callerId="${escapeXml(callerId)}"`;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial${dialAttrs}>
    <Number>${escapeXml(toRaw)}</Number>
  </Dial>
</Response>`.trim();

  logTwilioVoiceTrace({
    route: "POST /api/twilio/voice/softphone",
    client_call_sid: callSid,
    pstn_call_sid: null,
    ai_path_entered: false,
    softphone_bypass_path_entered: true,
    twiml_summary: summarizeTwimlResponse(xml),
    branch: "legacy_dial_number_pstn",
    parent_call_sid: parentCallSid,
    from_raw: fromRaw,
    to_raw: toRaw,
  });
  return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
}
