import type { SupabaseClient } from "@supabase/supabase-js";

import { upsertPhoneCallFromWebhook } from "@/lib/phone/log-call";
import { logMoveToCellEvent } from "@/lib/phone/move-to-cell-events";
import { readMoveToCellMeta } from "@/lib/phone/move-to-cell-types";
import { findPhoneCallRowByTwilioCallSid } from "@/lib/phone/phone-call-lookup-by-call-sid";
import type { SoftphoneConferenceMeta } from "@/lib/twilio/softphone-conference";
import { teardownSoftphoneConferenceFromMetadata } from "@/lib/twilio/softphone-conference-teardown";

export type EndActiveConferenceCallInput = {
  /** Browser Client leg or canonical `phone_calls.external_call_id`. */
  lookupCallSid: string;
  conferenceSid?: string | null;
  reason: string;
};

export type EndActiveConferenceCallResult = {
  ok: boolean;
  steps: string[];
  error?: string;
  client_call_sid?: string;
  conference_sid?: string | null;
};

/**
 * End an active softphone conference (customer + any remaining legs) and mark the call completed.
 */
export async function endActiveWorkspaceConferenceCall(
  supabase: SupabaseClient,
  input: EndActiveConferenceCallInput
): Promise<EndActiveConferenceCallResult> {
  const lookupSid = input.lookupCallSid.trim();
  if (!lookupSid.startsWith("CA")) {
    return { ok: false, steps: [], error: "lookupCallSid must be a Twilio CallSid (CA…)" };
  }

  console.log(
    JSON.stringify({
      tag: "active-call-end",
      event: "active_call_end_requested",
      lookup_call_sid: lookupSid,
      conference_sid: input.conferenceSid?.trim() || null,
      reason: input.reason,
    })
  );

  const row = await findPhoneCallRowByTwilioCallSid(supabase, lookupSid);
  if (!row?.id) {
    console.log(
      JSON.stringify({
        tag: "active-call-end",
        event: "active_call_end_api_failed",
        reason: "phone_call_not_found",
        lookup_call_sid: lookupSid,
      })
    );
    return { ok: false, steps: [], error: "phone_call not found" };
  }

  const meta = row.metadata ?? {};
  const moveToCell = readMoveToCellMeta(meta);
  const sc = (meta.softphone_conference ?? null) as SoftphoneConferenceMeta | null;
  const clientCallSid =
    moveToCell?.client_call_sid?.trim() ||
    (typeof sc?.client_call_sid === "string" ? sc.client_call_sid.trim() : "") ||
    row.external_call_id;
  const conferenceSid =
    input.conferenceSid?.trim() ||
    moveToCell?.conference_sid?.trim() ||
    (typeof sc?.conference_sid === "string" ? sc.conference_sid.trim() : "") ||
    "";

  const softphoneConference: SoftphoneConferenceMeta = {
    ...(sc ?? {}),
    conference_sid: conferenceSid || sc?.conference_sid,
    client_call_sid: clientCallSid,
    pstn_call_sid:
      moveToCell?.customer_call_sid?.trim() ||
      (typeof sc?.pstn_call_sid === "string" ? sc.pstn_call_sid.trim() : undefined),
  };

  const teardown = await teardownSoftphoneConferenceFromMetadata({
    clientCallSid,
    softphoneConference,
    reason: input.reason,
  });

  const endedAt = new Date().toISOString();
  const upsert = await upsertPhoneCallFromWebhook(supabase, {
    external_call_id: row.external_call_id,
    status: "completed",
    ended_at: endedAt,
  });

  if (!upsert.ok) {
    console.warn(
      JSON.stringify({
        tag: "active-call-end",
        event: "active_call_end_api_failed",
        reason: "phone_call_status_update_failed",
        error: upsert.error,
        lookup_call_sid: lookupSid,
      })
    );
  }

  if (moveToCell?.status === "connected_on_cell") {
    await logMoveToCellEvent(supabase, clientCallSid, "move_to_cell_staff_cell_hangup_ended_conference", {
      conference_sid: conferenceSid || null,
      teardown_steps: teardown.steps,
    });
  }

  const result: EndActiveConferenceCallResult = {
    ok: teardown.ok,
    steps: teardown.steps,
    error: teardown.error,
    client_call_sid: clientCallSid,
    conference_sid: conferenceSid || null,
  };

  if (teardown.ok) {
    console.log(
      JSON.stringify({
        tag: "active-call-end",
        event: "active_call_end_api_completed",
        lookup_call_sid: lookupSid,
        client_call_sid: clientCallSid,
        conference_sid: conferenceSid || null,
        steps: teardown.steps,
        reason: input.reason,
      })
    );
  } else {
    console.log(
      JSON.stringify({
        tag: "active-call-end",
        event: "active_call_end_api_failed",
        lookup_call_sid: lookupSid,
        error: teardown.error,
        steps: teardown.steps,
        reason: input.reason,
      })
    );
  }

  return result;
}
