import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { notifyInboundBackupCallStaffPush } from "@/lib/push/notify-inbound-call";
import { handleInboundDialCascadePost, loadVoiceRoutingJsonV1ByExternalCallId } from "@/lib/phone/twilio-inbound-dial-cascade";
import {
  buildInboundPstnOnlyDialTwiml,
  clientDialNounXml,
  readTwilioVoiceRingE164FromEnv,
  resolveInboundPstnFallbackCallerId,
} from "@/lib/phone/twilio-voice-handoff";
import {
  readEscalationPstnFallbackE164FromEnv,
  resolveEscalationBackupRingTimeoutSeconds,
  resolveEscalationPstnRingTimeoutSeconds,
} from "@/lib/phone/voice-escalation-config";
import { buildSaintlyVoicemailRecordTwiml, resolveTwilioVoicePublicBase } from "@/lib/phone/twilio-voicemail-twiml";
import { updateVoiceCallSessionEscalation } from "@/lib/phone/voice-call-sessions";
import { normalizeDialInputToE164 } from "@/lib/softphone/phone-number";
import { resolveBackupInboundStaffUserIdsAsync } from "@/lib/softphone/inbound-staff-ids";
import { softphoneTwilioClientIdentity } from "@/lib/softphone/twilio-client-identity";
import { logTwilioVoiceTrace, summarizeTwimlResponse } from "@/lib/twilio/twilio-voice-trace-log";
import { parseVerifiedTwilioFormBody } from "@/lib/twilio/verify-form-post";

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Inbound escalation ladder: after primary &lt;Dial&gt; times out (Twilio server-side timer),
 * optionally ring backup staff, then PSTN fallback, then dial-result → voicemail.
 */
export async function POST(req: NextRequest) {
  const parsed = await parseVerifiedTwilioFormBody(req);
  if (!parsed.ok) {
    return parsed.response;
  }

  const url = new URL(req.url);
  const step = url.searchParams.get("step")?.trim() || "after_primary";

  const params = parsed.params as Record<string, string | undefined>;
  const dialStatus = (params.DialCallStatus || "").trim().toLowerCase();
  const callSid = params.CallSid?.trim();
  const parentCallSid = typeof params.ParentCallSid === "string" ? params.ParentCallSid.trim() : "";
  const externalCallId = parentCallSid || callSid || "";

  const publicBase = resolveTwilioVoicePublicBase();

  if (dialStatus === "completed") {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
    logTwilioVoiceTrace({
      route: "POST /api/twilio/voice/inbound-escalation",
      client_call_sid: callSid ?? null,
      pstn_call_sid: null,
      ai_path_entered: false,
      softphone_bypass_path_entered: false,
      twiml_summary: summarizeTwimlResponse(xml),
      branch: "dial_completed_noop",
      parent_call_sid: parentCallSid || null,
      from_raw: params.From,
      to_raw: params.To,
    });
    return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }

  if (!publicBase) {
    const say = `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">Please try your call again later.</Say></Response>`;
    return new NextResponse(say, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }

  if (externalCallId && (await loadVoiceRoutingJsonV1ByExternalCallId(externalCallId))) {
    const xml = await handleInboundDialCascadePost({ params, publicBase });
    logTwilioVoiceTrace({
      route: "POST /api/twilio/voice/inbound-escalation",
      client_call_sid: callSid ?? null,
      pstn_call_sid: null,
      ai_path_entered: false,
      softphone_bypass_path_entered: false,
      twiml_summary: summarizeTwimlResponse(xml),
      branch: "delegate_inbound_dial_cascade",
      parent_call_sid: parentCallSid || null,
      from_raw: params.From,
      to_raw: params.To,
    });
    return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }

  const callerId = resolveInboundPstnFallbackCallerId(params);

  const { data: phoneRow } =
    externalCallId.length > 0
      ? await supabaseAdmin
          .from("phone_calls")
          .select("id")
          .eq("external_call_id", externalCallId)
          .maybeSingle()
      : { data: null };

  const phoneCallId = typeof phoneRow?.id === "string" ? phoneRow.id : null;

  if (step === "after_primary") {
    const backupIds = await resolveBackupInboundStaffUserIdsAsync();
    if (backupIds.length > 0) {
      await updateVoiceCallSessionEscalation(supabaseAdmin, {
        externalCallId,
        escalationLevel: 2,
      });
      if (phoneCallId) {
        void notifyInboundBackupCallStaffPush(supabaseAdmin, {
          phoneCallId,
          externalCallId,
          fromE164: params.From,
          toE164: params.To,
        });
      }

      const statusCallbackUrl = `${publicBase}/api/twilio/voice/status`;
      const afterBackupUrl = `${publicBase}/api/twilio/voice/inbound-escalation?step=after_backup`;
      const backupRingSec = resolveEscalationBackupRingTimeoutSeconds();

      const browserDialAttrs = ` answerOnBridge="true" timeout="${backupRingSec}" callerId="${escapeXml(
        callerId
      )}" action="${escapeXml(
        afterBackupUrl
      )}" method="POST" statusCallback="${escapeXml(
        statusCallbackUrl
      )}" statusCallbackMethod="POST" statusCallbackEvent="initiated ringing answered completed"`;

      const clientBodies = backupIds
        .map((id) => clientDialNounXml(softphoneTwilioClientIdentity(id), callerId))
        .join("");

      const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Dial${browserDialAttrs}>
    ${clientBodies}
  </Dial>
</Response>`.trim();

      logTwilioVoiceTrace({
        route: "POST /api/twilio/voice/inbound-escalation",
        client_call_sid: callSid ?? null,
        pstn_call_sid: null,
        ai_path_entered: false,
        softphone_bypass_path_entered: false,
        twiml_summary: summarizeTwimlResponse(xml),
        branch: "escalation_backup_dial",
        parent_call_sid: parentCallSid || null,
        from_raw: params.From,
        to_raw: params.To,
      });
      return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
    }

    const ringRaw = readEscalationPstnFallbackE164FromEnv() || readTwilioVoiceRingE164FromEnv();
    const pstnNorm = ringRaw.trim().length > 0 ? normalizeDialInputToE164(ringRaw.trim()) : null;
    if (pstnNorm) {
      await updateVoiceCallSessionEscalation(supabaseAdmin, {
        externalCallId,
        escalationLevel: 3,
        forwardedToNumber: pstnNorm,
      });
      const pstnTwiml = buildInboundPstnOnlyDialTwiml({
        publicBase,
        callerId,
        ringE164Raw: ringRaw,
        dialTimeoutSeconds: resolveEscalationPstnRingTimeoutSeconds(),
      });
      if (pstnTwiml) {
        logTwilioVoiceTrace({
          route: "POST /api/twilio/voice/inbound-escalation",
          client_call_sid: callSid ?? null,
          pstn_call_sid: null,
          ai_path_entered: false,
          softphone_bypass_path_entered: false,
          twiml_summary: summarizeTwimlResponse(pstnTwiml),
          branch: "escalation_pstn_after_primary",
          parent_call_sid: parentCallSid || null,
          from_raw: params.From,
          to_raw: params.To,
        });
        return new NextResponse(pstnTwiml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
      }
    }

    const vm = buildSaintlyVoicemailRecordTwiml(publicBase);
    logTwilioVoiceTrace({
      route: "POST /api/twilio/voice/inbound-escalation",
      client_call_sid: callSid ?? null,
      pstn_call_sid: null,
      ai_path_entered: false,
      softphone_bypass_path_entered: false,
      twiml_summary: summarizeTwimlResponse(vm),
      branch: "escalation_voicemail_after_primary",
      parent_call_sid: parentCallSid || null,
      from_raw: params.From,
      to_raw: params.To,
    });
    return new NextResponse(vm, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }

  if (step === "after_backup") {
    const ringRaw = readEscalationPstnFallbackE164FromEnv() || readTwilioVoiceRingE164FromEnv();
    const pstnNorm = ringRaw.trim().length > 0 ? normalizeDialInputToE164(ringRaw.trim()) : null;
    if (pstnNorm) {
      await updateVoiceCallSessionEscalation(supabaseAdmin, {
        externalCallId,
        escalationLevel: 3,
        forwardedToNumber: pstnNorm,
      });
      const pstnTwiml = buildInboundPstnOnlyDialTwiml({
        publicBase,
        callerId,
        ringE164Raw: ringRaw,
        dialTimeoutSeconds: resolveEscalationPstnRingTimeoutSeconds(),
      });
      if (pstnTwiml) {
        logTwilioVoiceTrace({
          route: "POST /api/twilio/voice/inbound-escalation",
          client_call_sid: callSid ?? null,
          pstn_call_sid: null,
          ai_path_entered: false,
          softphone_bypass_path_entered: false,
          twiml_summary: summarizeTwimlResponse(pstnTwiml),
          branch: "escalation_pstn_after_backup",
          parent_call_sid: parentCallSid || null,
          from_raw: params.From,
          to_raw: params.To,
        });
        return new NextResponse(pstnTwiml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
      }
    }

    const vm = buildSaintlyVoicemailRecordTwiml(publicBase);
    logTwilioVoiceTrace({
      route: "POST /api/twilio/voice/inbound-escalation",
      client_call_sid: callSid ?? null,
      pstn_call_sid: null,
      ai_path_entered: false,
      softphone_bypass_path_entered: false,
      twiml_summary: summarizeTwimlResponse(vm),
      branch: "escalation_voicemail_after_backup",
      parent_call_sid: parentCallSid || null,
      from_raw: params.From,
      to_raw: params.To,
    });
    return new NextResponse(vm, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
  }

  const xml = `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
  return new NextResponse(xml, { status: 200, headers: { "Content-Type": "text/xml; charset=utf-8" } });
}
