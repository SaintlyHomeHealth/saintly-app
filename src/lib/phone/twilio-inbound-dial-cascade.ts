/**
 * Multi-step inbound dial cascade: browser ring groups → chained PSTN → voicemail.
 * State lives in `voice_call_sessions.routing_json` (see {@link VoiceRoutingJsonV1}).
 */

import { supabaseAdmin } from "@/lib/admin";
import { notifyInboundBackupCallStaffPush } from "@/lib/push/notify-inbound-call";
import type { VoicemailGreetingKind } from "@/lib/phone/twilio-voicemail-twiml";
import { buildSaintlyVoicemailRecordTwiml } from "@/lib/phone/twilio-voicemail-twiml";
import {
  buildInboundPstnCascadeDialTwiml,
  clientDialNounXml,
  resolveInboundCallerIdForClientDial,
  resolveInboundPstnFallbackCallerId,
} from "@/lib/phone/twilio-voice-handoff";
import {
  resolveEscalationBackupRingTimeoutSeconds,
  resolveEscalationPrimaryRingTimeoutSeconds,
  resolveEscalationPstnRingTimeoutSeconds,
} from "@/lib/phone/voice-escalation-config";
import type { CascadeStep, VoiceRoutingJsonV1 } from "@/lib/phone/voice-route-plan";
import { softphoneTwilioClientIdentity } from "@/lib/softphone/twilio-client-identity";
import { updateVoiceCallSessionEscalation, updateVoiceCallSessionRoutingJson } from "@/lib/phone/voice-call-sessions";

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function isRoutingJsonV1(value: unknown): value is VoiceRoutingJsonV1 {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return v.v === 1 && Array.isArray(v.steps);
}

export async function loadVoiceRoutingJsonV1ByExternalCallId(
  externalCallId: string
): Promise<VoiceRoutingJsonV1 | null> {
  const sid = externalCallId.trim();
  if (!sid) return null;
  const { data, error } = await supabaseAdmin
    .from("voice_call_sessions")
    .select("routing_json")
    .eq("external_call_id", sid)
    .maybeSingle();
  if (error) {
    console.warn("[twilio-inbound-dial-cascade] load routing_json:", error.message);
    return null;
  }
  const raw = data?.routing_json;
  return isRoutingJsonV1(raw) ? raw : null;
}

function cascadeActionUrl(publicBase: string): string {
  return `${publicBase.trim().replace(/\/$/, "")}/api/twilio/voice/inbound-dial-cascade`;
}

function voicemailGreetingFromRouting(r: VoiceRoutingJsonV1): VoicemailGreetingKind {
  if (r.voicemail_variant === "after_hours") return "after_hours";
  if (r.voicemail_variant === "business_hours") return "business_hours";
  return "default";
}

function browserRingSecondsForStep(step: CascadeStep): number {
  if (step.kind !== "browser") return resolveEscalationPrimaryRingTimeoutSeconds();
  if (step.label === "backup") return resolveEscalationBackupRingTimeoutSeconds();
  return resolveEscalationPrimaryRingTimeoutSeconds();
}

function pstnRingSecondsForStep(step: CascadeStep): number {
  if (step.kind !== "pstn") return resolveEscalationPstnRingTimeoutSeconds();
  return resolveEscalationPstnRingTimeoutSeconds();
}

/**
 * Emit TwiML for `routing.steps[stepIndex]` (browser / PSTN / voicemail).
 */
export function buildTwimlForCascadeStep(input: {
  publicBase: string;
  /** Caller ID for &lt;Dial&gt; to browser clients (PSTN caller’s number when available). */
  callerIdForBrowserDial: string;
  /** Caller ID for forwarded &lt;Dial&gt; to PSTN (typically your Twilio DID). */
  callerIdForPstnDial: string;
  routing: VoiceRoutingJsonV1;
  stepIndex: number;
}): string | null {
  const { publicBase, callerIdForBrowserDial, callerIdForPstnDial, routing } = input;
  const step = routing.steps[input.stepIndex];
  if (!step) {
    return null;
  }

  const statusCallbackUrl = publicBase ? `${publicBase}/api/twilio/voice/status` : "";
  const actionUrl = cascadeActionUrl(publicBase);
  const openingSay = "";

  if (step.kind === "browser") {
    if (step.userIds.length === 0) {
      return null;
    }
    const browserRingSec = browserRingSecondsForStep(step);
    const browserDialAttrs = publicBase
      ? ` answerOnBridge="true" timeout="${browserRingSec}" callerId="${escapeXml(
          callerIdForBrowserDial
        )}" action="${escapeXml(
          actionUrl
        )}" method="POST" statusCallback="${escapeXml(
          statusCallbackUrl
        )}" statusCallbackMethod="POST" statusCallbackEvent="initiated ringing answered completed"`
      : ` answerOnBridge="true" timeout="${browserRingSec}" callerId="${escapeXml(callerIdForBrowserDial)}"`;

    const clientBodies = step.userIds
      .map((id) => clientDialNounXml(softphoneTwilioClientIdentity(id), callerIdForBrowserDial))
      .join("");

    return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${openingSay}
  <Dial${browserDialAttrs}>
    ${clientBodies}
  </Dial>
</Response>`.trim();
  }

  if (step.kind === "pstn") {
    return buildInboundPstnCascadeDialTwiml({
      publicBase,
      callerId: callerIdForPstnDial,
      pstnRingNormalized: step.e164,
      dialTimeoutSeconds: pstnRingSecondsForStep(step),
    });
  }

  if (step.kind === "voicemail") {
    return buildSaintlyVoicemailRecordTwiml(publicBase, {
      greeting: voicemailGreetingFromRouting(routing),
    });
  }

  return null;
}

/**
 * First step for `/inbound-ring` — same TwiML shape as legacy escalation entry.
 */
export function buildFirstInboundCascadeTwiml(input: {
  publicBase: string;
  from: string;
  to: string;
  routing: VoiceRoutingJsonV1;
}): string | null {
  const callerIdForBrowserDial = resolveInboundCallerIdForClientDial(input.from, input.to);
  const callerIdForPstnDial = resolveInboundPstnFallbackCallerId({
    From: input.from,
    To: input.to,
    Called: input.to,
  });
  return buildTwimlForCascadeStep({
    publicBase: input.publicBase,
    callerIdForBrowserDial,
    callerIdForPstnDial,
    routing: input.routing,
    stepIndex: 0,
  });
}

/**
 * Twilio POST handler: advance cascade after a &lt;Dial&gt; ends without bridging.
 */
export async function handleInboundDialCascadePost(input: {
  params: Record<string, string | undefined>;
  publicBase: string;
}): Promise<string> {
  const params = input.params;
  const dialStatus = (params.DialCallStatus || "").trim().toLowerCase();
  const callSid = params.CallSid?.trim() || "";
  const parentCallSid = typeof params.ParentCallSid === "string" ? params.ParentCallSid.trim() : "";
  const externalCallId = parentCallSid || callSid;

  if (dialStatus === "completed") {
    return `<?xml version="1.0" encoding="UTF-8"?><Response></Response>`;
  }

  if (!input.publicBase.trim()) {
    return `<?xml version="1.0" encoding="UTF-8"?><Response><Say voice="Polly.Joanna">${escapeXml(
      "Please try your call again later."
    )}</Say></Response>`;
  }

  const routing = await loadVoiceRoutingJsonV1ByExternalCallId(externalCallId);
  if (!routing) {
    const vm = buildSaintlyVoicemailRecordTwiml(input.publicBase, { greeting: "default" });
    return vm;
  }

  const nextIndex = routing.active_step_index + 1;
  if (nextIndex >= routing.steps.length) {
    return buildSaintlyVoicemailRecordTwiml(input.publicBase, { greeting: voicemailGreetingFromRouting(routing) });
  }

  const nextStep = routing.steps[nextIndex];
  const callerIdForBrowserDial = resolveInboundCallerIdForClientDial(
    (params.From ?? "").trim(),
    (params.To ?? "").trim()
  );
  const callerIdForPstnDial = resolveInboundPstnFallbackCallerId(params);

  const updated: VoiceRoutingJsonV1 = {
    ...routing,
    active_step_index: nextIndex,
  };
  await updateVoiceCallSessionRoutingJson(supabaseAdmin, {
    externalCallId,
    routingJson: updated,
  });

  if (nextStep.kind === "browser" && nextStep.label === "backup") {
    const { data: phoneRow } = await supabaseAdmin
      .from("voice_call_sessions")
      .select("phone_call_id")
      .eq("external_call_id", externalCallId)
      .maybeSingle();
    const phoneCallId = typeof phoneRow?.phone_call_id === "string" ? phoneRow.phone_call_id : null;
    if (phoneCallId) {
      void notifyInboundBackupCallStaffPush(supabaseAdmin, {
        phoneCallId,
        externalCallId,
        fromE164: params.From,
      });
    }
    await updateVoiceCallSessionEscalation(supabaseAdmin, {
      externalCallId,
      escalationLevel: 2,
    });
  }

  if (nextStep.kind === "pstn") {
    await updateVoiceCallSessionEscalation(supabaseAdmin, {
      externalCallId,
      escalationLevel: 3,
      forwardedToNumber: nextStep.e164,
    });
  }

  const twiml = buildTwimlForCascadeStep({
    publicBase: input.publicBase,
    callerIdForBrowserDial,
    callerIdForPstnDial,
    routing: updated,
    stepIndex: nextIndex,
  });

  if (!twiml) {
    return buildSaintlyVoicemailRecordTwiml(input.publicBase, { greeting: voicemailGreetingFromRouting(updated) });
  }
  return twiml;
}
