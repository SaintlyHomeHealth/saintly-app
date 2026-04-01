import { sendSms } from "@/lib/twilio/send-sms";

/**
 * E.164 destination for operational SMS (missed calls, leads, visit status).
 * Prefer `OPERATIONAL_ALERT_SMS_TO`; falls back to `TWILIO_ALERT_TO` if unset.
 */
export function getOperationalAlertSmsTo(): string | null {
  const primary = process.env.OPERATIONAL_ALERT_SMS_TO?.trim();
  if (primary) return primary;
  return process.env.TWILIO_ALERT_TO?.trim() || null;
}

export async function sendOperationalAlertSms(
  body: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  const to = getOperationalAlertSmsTo();
  const text = body.trim();
  if (!to) {
    console.warn("[operational-alert-sms] skipped: OPERATIONAL_ALERT_SMS_TO and TWILIO_ALERT_TO unset");
    return { ok: false, error: "no_alert_to" };
  }
  if (!text) {
    return { ok: false, error: "empty_body" };
  }
  const r = await sendSms({ to, body: text });
  if (!r.ok) {
    console.warn("[operational-alert-sms] send failed:", r.error);
  }
  return r;
}
