import "server-only";

import { formatPhoneNumber } from "@/lib/phone/us-phone-format";
import { sendSms } from "@/lib/twilio/send-sms";
import {
  isSaintlyBackupSmsE164,
  isSaintlyPrimarySmsE164,
} from "@/lib/twilio/sms-from-numbers";
import type { TwilioPhoneNumberRow } from "@/lib/twilio/twilio-phone-number-repo";
import { isValidE164, normalizeDialInputToE164 } from "@/lib/softphone/phone-number";

/**
 * Comma-separated E.164 personal cells that receive a Twilio SMS copy for inbound texts on
 * company/shared lines (main + backup Saintly numbers and CRM rows typed `company_shared`).
 *
 * Opt-in only: numbers must be listed in `INBOUND_COMPANY_SMS_RELAY_TO`. There is **no** automatic
 * fallback to `OPERATIONAL_ALERT_SMS_TO` or `TWILIO_ALERT_TO` (those stay for operational / lead alerts).
 *
 * Optional legacy bridge: set `INBOUND_COMPANY_SMS_RELAY_FALLBACK_TO_OPS_ALERT=1` to also deliver to
 * the same destinations as `OPERATIONAL_ALERT_SMS_TO` / `TWILIO_ALERT_TO` (deduped).
 *
 * Set `INBOUND_COMPANY_SMS_RELAY_DISABLED=1` to turn relay off entirely (push + CRM persist unchanged).
 */
export function parseInboundCompanySmsRelayRecipients(): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const raw = process.env.INBOUND_COMPANY_SMS_RELAY_TO?.trim();
  if (raw) {
    for (const part of raw.split(",")) {
      const n = normalizeDialInputToE164(part.trim());
      if (!n || !isValidE164(n) || seen.has(n)) continue;
      seen.add(n);
      out.push(n);
    }
  }

  if (process.env.INBOUND_COMPANY_SMS_RELAY_FALLBACK_TO_OPS_ALERT === "1") {
    const primary = process.env.OPERATIONAL_ALERT_SMS_TO?.trim();
    const fallback = process.env.TWILIO_ALERT_TO?.trim();
    for (const cand of [primary, fallback]) {
      if (!cand) continue;
      const n = normalizeDialInputToE164(cand);
      if (!n || !isValidE164(n) || seen.has(n)) continue;
      seen.add(n);
      out.push(n);
    }
  }

  return out;
}

/** True when inbound SMS to `toE164` should mirror to personal relay numbers (not dedicated staff DIDs). */
export function shouldRelayInboundCompanySmsCopy(
  toE164: string,
  tnInbound: TwilioPhoneNumberRow | null
): boolean {
  if (process.env.INBOUND_COMPANY_SMS_RELAY_DISABLED === "1") return false;

  const dedicatedStaffDid =
    tnInbound &&
    tnInbound.status === "assigned" &&
    Boolean((tnInbound.assigned_user_id ?? "").trim()) &&
    tnInbound.number_type === "staff_direct";
  if (dedicatedStaffDid) return false;

  if (isSaintlyPrimarySmsE164(toE164) || isSaintlyBackupSmsE164(toE164)) return true;
  if (tnInbound?.is_primary_company_number) return true;
  if (tnInbound?.is_company_backup_number) return true;
  if (tnInbound?.number_type === "company_shared") return true;
  return false;
}

const RELAY_BODY_MAX = 1520;

/**
 * Sends one outbound SMS per relay recipient (Twilio Programmable SMS). Runs after CRM persist + push;
 * failures are logged only — never blocks inbound ingestion.
 */
export async function relayInboundCompanySmsCopyToPersonalCells(input: {
  fromE164: string;
  toE164: string;
  body: string;
  messageSid: string;
  /** MMS parts count from Twilio `NumMedia` (0 when SMS-only). */
  numMedia?: number | undefined;
}): Promise<void> {
  const recipients = parseInboundCompanySmsRelayRecipients();
  if (recipients.length === 0) {
    console.log(
      "[sms-relay] skipped (set INBOUND_COMPANY_SMS_RELAY_TO for opt-in relay, or INBOUND_COMPANY_SMS_RELAY_FALLBACK_TO_OPS_ALERT=1 for ops-alert fallback)"
    );
    return;
  }

  const line = formatPhoneNumber(input.toE164) || input.toE164;
  const fromParty = formatPhoneNumber(input.fromE164) || input.fromE164;
  const excerpt = (input.body ?? "").trim().slice(0, 900);
  const sidShort = input.messageSid.trim().slice(-8);
  const nm = typeof input.numMedia === "number" && Number.isFinite(input.numMedia) ? Math.max(0, Math.floor(input.numMedia)) : 0;
  const mmsTail = excerpt ? "" : nm > 0 ? ` (${nm === 1 ? "MMS / photo" : `MMS — ${nm} attachments`})` : "";
  let composed = `Saintly line ${line} — SMS from ${fromParty}${excerpt ? `: ${excerpt}` : mmsTail}`;
  if (sidShort) composed += ` [${sidShort}]`;
  composed = composed.slice(0, RELAY_BODY_MAX);

  for (const to of recipients) {
    const r = await sendSms({ to, body: composed });
    if (!r.ok) {
      console.warn("[sms-relay] send failed", { to: to.slice(0, 5) + "…", error: r.error });
    } else {
      console.log("[sms-relay] sent copy", { to: to.slice(0, 5) + "…", messageSid: r.messageSid?.slice(0, 12) });
    }
  }
}
