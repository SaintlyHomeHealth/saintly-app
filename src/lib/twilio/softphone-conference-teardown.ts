import twilio from "twilio";

import type { SoftphoneConferenceMeta } from "@/lib/twilio/softphone-conference";

export type SoftphoneTeardownResult = {
  ok: boolean;
  steps: string[];
  error?: string;
};

function shortSid(s: string | undefined | null): string {
  if (!s || typeof s !== "string") return "—";
  return `${s.slice(0, 10)}…`;
}

/**
 * Authoritative Twilio teardown for softphone conference mode:
 * 1) Complete the conference (disconnects all participants, including browser + PSTN + 3-way legs).
 * 2) If that fails or we have no ConferenceSid, complete PSTN + client Call legs individually.
 *
 * Parent control: **Conference** (CF…) when present; otherwise the **browser Client leg** (CA…) is the row key in `phone_calls`.
 */
export async function teardownSoftphoneConferenceFromMetadata(input: {
  clientCallSid: string;
  softphoneConference: SoftphoneConferenceMeta | null | undefined;
  /** When set, extra logs for support. */
  reason: string;
}): Promise<SoftphoneTeardownResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const steps: string[] = [];

  if (!accountSid || !authToken) {
    return { ok: false, steps, error: "Twilio credentials missing" };
  }

  const clientSid = input.clientCallSid.trim();
  const sc = input.softphoneConference;
  const conferenceSid = typeof sc?.conference_sid === "string" ? sc.conference_sid.trim() : "";
  const pstnSid = typeof sc?.pstn_call_sid === "string" ? sc.pstn_call_sid.trim() : "";

  console.log("[softphone-teardown] start", {
    reason: input.reason,
    clientLeg: shortSid(clientSid),
    conferenceSid: conferenceSid ? shortSid(conferenceSid) : null,
    pstnLeg: pstnSid ? shortSid(pstnSid) : null,
  });

  const client = twilio(accountSid, authToken);

  if (conferenceSid.startsWith("CF")) {
    try {
      await client.conferences(conferenceSid).update({ status: "completed" });
      steps.push("conference_status_completed");
      console.log("[softphone-teardown] conference completed", shortSid(conferenceSid));
      return { ok: true, steps };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[softphone-teardown] conference complete failed, falling back to call legs", msg);
      steps.push(`conference_complete_failed:${msg.slice(0, 80)}`);
    }
  }

  if (pstnSid.startsWith("CA")) {
    try {
      await client.calls(pstnSid).update({ status: "completed" });
      steps.push("pstn_call_completed");
      console.log("[softphone-teardown] PSTN leg completed", shortSid(pstnSid));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[softphone-teardown] PSTN complete failed", msg);
      steps.push(`pstn_complete_failed:${msg.slice(0, 80)}`);
    }
  }

  if (clientSid.startsWith("CA")) {
    try {
      await client.calls(clientSid).update({ status: "completed" });
      steps.push("client_leg_completed");
      console.log("[softphone-teardown] client leg completed", shortSid(clientSid));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn("[softphone-teardown] client leg complete failed", msg);
      steps.push(`client_complete_failed:${msg.slice(0, 80)}`);
      return { ok: false, steps, error: msg.slice(0, 200) };
    }
  }

  return { ok: true, steps };
}

/**
 * Hang up only the browser Client leg (e.g. remote party hung up first).
 */
export async function hangupClientLegOnly(clientCallSid: string, reason: string): Promise<SoftphoneTeardownResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!accountSid || !authToken) {
    return { ok: false, steps: [], error: "Twilio credentials missing" };
  }
  const sid = clientCallSid.trim();
  if (!sid.startsWith("CA")) {
    return { ok: false, steps: [], error: "invalid client CallSid" };
  }
  console.log("[softphone-teardown] hangupClientLegOnly", { reason, clientLeg: shortSid(sid) });
  try {
    const client = twilio(accountSid, authToken);
    await client.calls(sid).update({ status: "completed" });
    return { ok: true, steps: ["client_leg_completed_remote"] };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[softphone-teardown] hangupClientLegOnly failed", msg);
    return { ok: false, steps: [], error: msg.slice(0, 200) };
  }
}
