import { sendSms } from "@/lib/twilio/send-sms";
import { isValidE164, normalizeDialInputToE164 } from "@/lib/softphone/phone-number";

import { getOperationalAlertSmsTo } from "@/lib/ops/operational-alert-sms";

/**
 * Dedicated SMS recipients for new CRM lead alerts (`CRM_LEAD_ALERT_SMS_TO`, comma-separated E.164).
 * Does not use inbound company SMS relay.
 *
 * When unset or empty after parsing, falls back to the same destination chain as operational alerts
 * (`OPERATIONAL_ALERT_SMS_TO` then `TWILIO_ALERT_TO`) so existing single-recipient behavior is preserved.
 */
export function getCrmLeadAlertSmsRecipients(): string[] {
  const raw = process.env.CRM_LEAD_ALERT_SMS_TO?.trim();
  const seen = new Set<string>();
  const out: string[] = [];

  if (raw) {
    for (const part of raw.split(",")) {
      const n = normalizeDialInputToE164(part.trim());
      if (!n || !isValidE164(n) || seen.has(n)) continue;
      seen.add(n);
      out.push(n);
    }
    if (out.length > 0) return out;
  }

  const fallback = getOperationalAlertSmsTo()?.trim();
  if (fallback) {
    const n = normalizeDialInputToE164(fallback);
    if (n && isValidE164(n) && !seen.has(n)) out.push(n);
  }

  return out;
}

/** Sends the same short ops-safe body to each deduped CRM lead alert recipient. */
export async function sendCrmLeadAlertSms(
  body: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const recipients = getCrmLeadAlertSmsRecipients();
  const text = body.trim();
  if (recipients.length === 0) {
    console.warn(
      "[crm-lead-alert-sms] skipped: CRM_LEAD_ALERT_SMS_TO empty/invalid and OPERATIONAL_ALERT_SMS_TO / TWILIO_ALERT_TO unset"
    );
    return { ok: false, error: "no_recipients" };
  }
  if (!text) {
    return { ok: false, error: "empty_body" };
  }

  let lastError = "";
  let anyOk = false;
  for (const to of recipients) {
    const r = await sendSms({ to, body: text });
    if (r.ok) {
      anyOk = true;
    } else {
      lastError = r.error;
      console.warn("[crm-lead-alert-sms] send failed:", { error: r.error });
    }
  }

  if (!anyOk) {
    return { ok: false, error: lastError || "send_failed" };
  }
  return { ok: true };
}
