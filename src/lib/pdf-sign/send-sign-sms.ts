import "server-only";

import { normalizeDialInputToE164 } from "@/lib/softphone/phone-number";
import { sendSms } from "@/lib/twilio/send-sms";

const SMS_BODY_PREFIX =
  "Saintly Home Health sent you a document to sign. Please complete it here:";

export type SendSignLinkSmsArgs = {
  to?: string | null;
  signUrl: string;
  packetId?: string;
  recipientId?: string;
};

/**
 * Empty `to` → `skipped` (not an error). Twilio misconfig / failures → `failed`.
 * Never throws from this module.
 */
export type SendSignLinkSmsResult =
  | { kind: "skipped" }
  | { kind: "sent"; messageSid: string }
  | { kind: "failed"; error: string };

function buildBody(signUrl: string): string {
  return `${SMS_BODY_PREFIX} ${signUrl}`;
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
    const logCtx = {
      packetId: args.packetId,
      recipientId: args.recipientId,
    };
    console.warn("[pdf-sign] sendSignLinkSms: missing signUrl", logCtx);
    return { kind: "failed", error: "Missing signing link." };
  }

  const e164 = normalizeDialInputToE164(raw);
  if (!e164) return { kind: "failed", error: "Invalid phone number." };

  const logCtx = { packetId: args.packetId, recipientId: args.recipientId };

  try {
    const body = buildBody(url);
    const res = await sendSms({ to: e164, body });
    if (!res.ok) {
      console.warn("[pdf-sign] SMS send failed:", { ...logCtx, error: res.error });
      return { kind: "failed", error: res.error };
    }
    return { kind: "sent", messageSid: res.messageSid };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.warn("[pdf-sign] SMS send threw:", { ...logCtx, error: msg });
    return { kind: "failed", error: msg };
  }
}
