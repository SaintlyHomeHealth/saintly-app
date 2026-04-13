import { NextRequest, NextResponse } from "next/server";

import { supabaseAdmin } from "@/lib/admin";
import { mergeSoftphoneConferenceMetadata } from "@/lib/phone/merge-softphone-conference-metadata";
import {
  clientCallSidFromConferenceFriendlyName,
  isClientIdentityFrom,
} from "@/lib/twilio/softphone-conference";
import { parseVerifiedTwilioFormBody } from "@/lib/twilio/verify-form-post";

/**
 * Conference / participant callbacks for softphone PSTN + Client legs (no marketplace plugins).
 * Correlates participants to `phone_calls.external_call_id` via FriendlyName `sf-<ClientCallSid>`.
 */
export async function POST(req: NextRequest) {
  const parsed = await parseVerifiedTwilioFormBody(req);
  if (!parsed.ok) {
    return parsed.response;
  }

  const p = parsed.params;
  const friendly = p.FriendlyName?.trim() || "";
  const conferenceSid = p.ConferenceSid?.trim() || "";
  const participantCallSid = p.CallSid?.trim() || "";
  const from = p.From?.trim() || "";
  const label = (p.ParticipantLabel || p.participantLabel || "").trim().toLowerCase();
  const event = (p.StatusCallbackEvent || p.Event || "").trim().toLowerCase();

  const clientSid = clientCallSidFromConferenceFriendlyName(friendly);
  if (!clientSid) {
    console.warn("[softphone-conference-events] skip_unrecognized_friendly_name", {
      friendly: friendly.slice(0, 80),
    });
    return new NextResponse("OK", { status: 200, headers: { "Content-Type": "text/plain" } });
  }

  const patch: Parameters<typeof mergeSoftphoneConferenceMetadata>[2] = {
    friendly_name: friendly,
    conference_sid: conferenceSid || undefined,
    last_conference_event: event || undefined,
  };

  /**
   * Correlate by CallSid identity (reliable): the browser Client leg’s CallSid equals `clientSid`
   * from the room name `sf-<clientSid>`. Any other participant CallSid is the REST PSTN leg (primary
   * callee). Labels / From are fallbacks only — Twilio casing varies.
   */
  if (participantCallSid.startsWith("CA")) {
    if (participantCallSid === clientSid) {
      patch.client_call_sid = participantCallSid;
    } else {
      patch.pstn_call_sid = participantCallSid;
    }
  } else if (label === "pstn" || (!label && !isClientIdentityFrom(from))) {
    patch.pstn_call_sid = participantCallSid;
  } else if (label === "staff" || (!label && isClientIdentityFrom(from))) {
    patch.client_call_sid = participantCallSid;
  }

  console.log("[softphone-conference-events]", {
    friendly: friendly.slice(0, 48),
    event,
    conferenceSid: conferenceSid ? `${conferenceSid.slice(0, 12)}…` : null,
    participantCallSid: participantCallSid ? `${participantCallSid.slice(0, 12)}…` : null,
    clientSidMatch: participantCallSid === clientSid,
    label,
  });

  const result = await mergeSoftphoneConferenceMetadata(supabaseAdmin, clientSid, patch);
  if (!result.ok) {
    console.warn("[softphone-conference-events] merge_failed", result.error, { clientSid: clientSid.slice(0, 12) });
  }

  return new NextResponse("OK", { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
