import { getTwilioSmsOutboundDiagnostics } from "@/lib/twilio/sms-outbound-diagnostics";
import { resolveTwilioWebhookBaseUrl } from "@/lib/twilio/signature-url";

export type SendSmsParams = {
  to: string;
  body: string;
  /**
   * When set, used instead of `TWILIO_SMS_FROM` for this send only (E.164 `From` or `MG…` Messaging Service SID).
   * Keeps global inbox/Twilio defaults unchanged while allowing targeted outbound (e.g. Facebook lead intro).
   */
  fromOverride?: string;
};

export type SendSmsResult =
  | {
      ok: true;
      messageSid: string;
      /** Twilio Message `status` from the REST 201 response (e.g. queued, sending). */
      twilioStatus?: string | null;
      /** Twilio `account_sid` from the REST response. */
      twilioAccountSid?: string | null;
    }
  | { ok: false; error: string };

function formatTwilioRestError(status: number, rawBody: string): string {
  const trimmed = rawBody.trim().slice(0, 1200);
  try {
    const j = JSON.parse(trimmed) as { message?: unknown; code?: unknown; status?: unknown };
    const msg = typeof j.message === "string" ? j.message : null;
    const code = j.code != null ? String(j.code) : null;
    if (msg) {
      return code ? `[HTTP ${status}] [Twilio ${code}] ${msg}` : `[HTTP ${status}] ${msg}`;
    }
  } catch {
    /* not JSON */
  }
  return `[HTTP ${status}] ${trimmed}`;
}

/**
 * Twilio Programmable Messaging (REST). Requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_SMS_FROM.
 *
 * `TWILIO_SMS_FROM` may be either:
 * - A Messaging Service SID (`MG…`) → request uses `MessagingServiceSid` (required by Twilio; do not send as `From`).
 * - A phone number in E.164 → request uses `From` (use any Twilio SMS-capable number, e.g. a temporary DID until porting completes).
 *
 * Returns Twilio MessageSid on success for durable logging (messages.external_message_sid).
 */
export async function sendSms(params: SendSmsParams): Promise<SendSmsResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const fromOrMsid =
    (typeof params.fromOverride === "string" ? params.fromOverride.trim() : "") ||
    process.env.TWILIO_SMS_FROM?.trim();
  const to = params.to.trim();
  const body = params.body.trim();

  const diag = getTwilioSmsOutboundDiagnostics();
  if (!accountSid || !authToken || !fromOrMsid) {
    console.warn("[sms-twilio] blocked missing env", {
      missingEnvVars: diag.missingEnvVars,
      outboundMode: diag.outboundMode,
      outboundSenderMasked: diag.outboundSenderMasked,
    });
    return {
      ok: false,
      error: `Twilio SMS not configured — missing: ${diag.missingEnvVars.join(", ") || "unknown"}`,
    };
  }

  const debugSms = process.env.SMS_TWILIO_DEBUG === "1" || process.env.NODE_ENV === "development";
  if (debugSms) {
    console.log("[sms-twilio] outbound config snapshot", {
      outboundMode: diag.outboundMode,
      outboundSenderMasked: diag.outboundSenderMasked,
      webhookBaseResolved: diag.webhookBaseResolved,
    });
  }
  if (!to || !body) {
    return { ok: false, error: "to and body are required" };
  }

  const useMessagingService = fromOrMsid.startsWith("MG");
  const form = new URLSearchParams();
  form.set("To", to);
  form.set("Body", body);
  if (useMessagingService) {
    form.set("MessagingServiceSid", fromOrMsid);
  } else {
    form.set("From", fromOrMsid);
  }

  const webhookBase = resolveTwilioWebhookBaseUrl();
  if (webhookBase) {
    const statusUrl = `${webhookBase}/api/twilio/sms/status`;
    form.set("StatusCallback", statusUrl);
    form.set("StatusCallbackMethod", "POST");
    console.log("[sms-twilio] StatusCallback", { statusUrl });
  } else {
    console.warn(
      "[sms-twilio] StatusCallback skipped — set TWILIO_WEBHOOK_BASE_URL or TWILIO_PUBLIC_BASE_URL to receive delivery webhooks"
    );
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`;
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  console.log("[sms-twilio] REST Messages send (pre-POST)", {
    to,
    bodyLen: body.length,
    outboundMode: useMessagingService ? "MessagingServiceSid" : "From",
    fromMasked: diag.outboundSenderMasked,
    accountSidPrefix: accountSid ? `${accountSid.slice(0, 2)}…` : null,
  });

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });

    const rawText = await res.text();

    if (!res.ok) {
      const errMsg = formatTwilioRestError(res.status, rawText);
      console.error("[sms-twilio] REST error (HTTP)", {
        httpStatus: res.status,
        errorMessage: errMsg,
        to,
        fromMasked: diag.outboundSenderMasked,
        outboundMode: useMessagingService ? "MessagingServiceSid" : "From",
      });
      return { ok: false, error: errMsg };
    }

    let json: { sid?: string; status?: string; account_sid?: string };
    try {
      json = JSON.parse(rawText) as { sid?: string; status?: string; account_sid?: string };
    } catch {
      console.error("[sms-twilio] success response not JSON", rawText.slice(0, 400));
      return { ok: false, error: "Twilio response was not valid JSON" };
    }

    const messageSid = typeof json.sid === "string" && json.sid.trim() !== "" ? json.sid.trim() : null;
    if (!messageSid) {
      return { ok: false, error: "Twilio response missing Message sid" };
    }

    const twilioStatus =
      typeof json.status === "string" && json.status.trim() !== "" ? json.status.trim().toLowerCase() : null;
    const twilioAccountSid =
      typeof json.account_sid === "string" && json.account_sid.trim() !== "" ? json.account_sid.trim() : null;

    console.log("[sms-twilio] REST ok", {
      messageSid,
      twilioStatus: twilioStatus ?? undefined,
      outboundMode: useMessagingService ? "MessagingServiceSid" : "From",
      fromMasked: diag.outboundSenderMasked,
    });
    return { ok: true, messageSid, twilioStatus, twilioAccountSid };
  } catch (e) {
    console.error("[sms-twilio] REST exception (network/fetch)", {
      err: e,
      fromMasked: diag.outboundSenderMasked,
      to,
    });
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
