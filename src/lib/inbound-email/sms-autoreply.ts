import "server-only";

import { sendSms } from "@/lib/twilio/send-sms";

import type { InboundEmailChannelKey } from "./types";
import type { InboundEmailNormalized } from "./types";

function flagEnabled(envName: string): boolean {
  const v = process.env[envName]?.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/**
 * Per-channel SMS autoreply (all default off). Billing never sends.
 */
export async function maybeSendInboundEmailAutoreply(input: {
  channel: InboundEmailChannelKey;
  normalized: InboundEmailNormalized;
  primaryE164: string | null;
}): Promise<void> {
  const { channel, primaryE164 } = input;
  const logP = `[inbound-email][${channel}]`;

  if (channel === "billing") {
    console.log(`${logP} sms_autoreply skipped (billing channel)`);
    return;
  }

  const flagKey =
    channel === "referrals"
      ? "EMAIL_REFERRALS_SMS_AUTOREPLY_ENABLED"
      : channel === "care"
        ? "EMAIL_CARE_SMS_AUTOREPLY_ENABLED"
        : "EMAIL_JOIN_SMS_AUTOREPLY_ENABLED";

  if (!flagEnabled(flagKey)) {
    console.log(`${logP} sms_autoreply disabled (${flagKey}=false)`);
    return;
  }

  if (!primaryE164) {
    console.log(`${logP} sms_autoreply skipped: no_confident_e164`);
    return;
  }

  const body =
    channel === "referrals"
      ? "Thanks for reaching Saintly Home Health — we received your referral message and will review it shortly."
      : channel === "care"
        ? "Thanks for contacting Saintly Home Health. We've received your message and our team will follow up."
        : "Thanks for your interest in joining Saintly Home Health. We've received your message and recruiting will follow up.";

  const r = await sendSms({ to: primaryE164, body });
  if (!r.ok) {
    console.warn(`${logP} sms_autoreply send failed`, r.error);
    return;
  }
  console.log(`${logP} sms_autoreply sent ok`, { toMasked: primaryE164.slice(0, 6) + "…" });
}
