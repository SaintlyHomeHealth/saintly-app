import "server-only";

import { resolveTwilioWebhookBaseUrl } from "@/lib/twilio/signature-url";

/**
 * Safe for logs: which Twilio SMS env vars exist and masked outbound identity.
 * Never log secrets. TWILIO_SMS_FROM may be E.164 or Messaging Service SID (MG…).
 *
 * Required for outbound SMS: TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_SMS_FROM
 * Optional: TWILIO_WEBHOOK_BASE_URL / TWILIO_PUBLIC_BASE_URL (StatusCallback on sends)
 */
export type TwilioSmsOutboundDiagnostics = {
  credentialsComplete: boolean;
  /** Env names that are missing or blank */
  missingEnvVars: ("TWILIO_ACCOUNT_SID" | "TWILIO_AUTH_TOKEN" | "TWILIO_SMS_FROM")[];
  /** Human-readable outbound sender (masked) */
  outboundSenderMasked: string;
  outboundMode: "messaging_service" | "from_e164" | "from_raw" | "missing";
  accountSidPresent: boolean;
  authTokenPresent: boolean;
  webhookBaseResolved: boolean;
};

function maskSid(s: string): string {
  const t = s.trim();
  if (t.length <= 8) return "***";
  return `${t.slice(0, 2)}…${t.slice(-4)}`;
}

function maskPhoneE164(s: string): string {
  const d = s.replace(/\D/g, "");
  if (d.length < 4) return "***";
  return `+…${d.slice(-4)}`;
}

export function getTwilioSmsOutboundDiagnostics(): TwilioSmsOutboundDiagnostics {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const fromOrMsid = process.env.TWILIO_SMS_FROM?.trim();

  const missing: TwilioSmsOutboundDiagnostics["missingEnvVars"] = [];
  if (!accountSid) missing.push("TWILIO_ACCOUNT_SID");
  if (!authToken) missing.push("TWILIO_AUTH_TOKEN");
  if (!fromOrMsid) missing.push("TWILIO_SMS_FROM");

  let outboundMode: TwilioSmsOutboundDiagnostics["outboundMode"] = "missing";
  let outboundSenderMasked = "(not set)";

  if (fromOrMsid) {
    if (fromOrMsid.startsWith("MG")) {
      outboundMode = "messaging_service";
      outboundSenderMasked = `MessagingService ${maskSid(fromOrMsid)}`;
    } else if (fromOrMsid.startsWith("+")) {
      outboundMode = "from_e164";
      outboundSenderMasked = maskPhoneE164(fromOrMsid);
    } else {
      outboundMode = "from_raw";
      outboundSenderMasked = maskSid(fromOrMsid);
    }
  }

  const webhookBase = resolveTwilioWebhookBaseUrl();

  return {
    credentialsComplete: missing.length === 0,
    missingEnvVars: missing,
    outboundSenderMasked,
    outboundMode,
    accountSidPresent: Boolean(accountSid),
    authTokenPresent: Boolean(authToken),
    webhookBaseResolved: Boolean(webhookBase),
  };
}
