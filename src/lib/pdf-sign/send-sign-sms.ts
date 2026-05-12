import "server-only";

import { sendSms } from "@/lib/twilio/send-sms";

function normalizeUsPhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  if (raw.trim().startsWith("+")) return `+${digits}`;
  return null;
}

export type SendSignLinkSmsArgs = {
  to?: string | null;
  signUrl: string;
  recipientName?: string | null;
  packetName?: string | null;
};

/**
 * Empty `to` → `skipped` (not an error). Twilio misconfig / failures → `failed`.
 * Never throws from this module.
 */
export type SendSignLinkSmsResult =
  | { kind: "skipped" }
  | { kind: "sent"; messageSid: string }
  | { kind: "failed"; error: string };

function buildBody(args: SendSignLinkSmsArgs): string {
  const name = args.recipientName?.trim().slice(0, 40);
  const doc = args.packetName?.trim().slice(0, 60) || "your document";
  const prefix = name ? `Hi ${name}, ` : "";
  return `${prefix}Saintly Home Health: Please review and sign ${doc}: ${args.signUrl}`;
}

/**
 * Sends a signing link via SMS when `to` is present and valid.
 * Reuses `sendSms` (Twilio). Logs on failure; does not throw.
 *
 * Note: Returns a result so API routes can persist `sms_sent_at` / `sms_error`.
 */
export async function sendSignLinkSms(args: SendSignLinkSmsArgs): Promise<SendSignLinkSmsResult> {
  const raw = typeof args.to === "string" ? args.to.trim() : "";
  if (!raw) return { kind: "skipped" };

  const url = args.signUrl?.trim() ?? "";
  if (!url) {
    console.warn("[pdf-sign] sendSignLinkSms: missing signUrl, skipping SMS");
    return { kind: "failed", error: "Missing signing link." };
  }

  const e164 = normalizeUsPhone(raw);
  if (!e164) return { kind: "failed", error: "Invalid phone number." };

  try {
    const body = buildBody({ ...args, signUrl: url });
    const res = await sendSms({ to: e164, body });
    if (!res.ok) {
      console.warn("[pdf-sign] SMS send failed:", res.error);
      return { kind: "failed", error: res.error };
    }
    return { kind: "sent", messageSid: res.messageSid };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[pdf-sign] SMS send threw:", msg);
    return { kind: "failed", error: msg };
  }
}
