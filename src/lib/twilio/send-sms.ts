export type SendSmsParams = {
  to: string;
  body: string;
};

export type SendSmsResult =
  | { ok: true; messageSid: string }
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
 * - A phone number in E.164 → request uses `From`.
 *
 * Returns Twilio MessageSid on success for durable logging (messages.external_message_sid).
 */
export async function sendSms(params: SendSmsParams): Promise<SendSmsResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const fromOrMsid = process.env.TWILIO_SMS_FROM?.trim();
  const to = params.to.trim();
  const body = params.body.trim();

  if (!accountSid || !authToken || !fromOrMsid) {
    console.warn("[sms-twilio] missing TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_SMS_FROM");
    return { ok: false, error: "Twilio SMS credentials not configured" };
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

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`;
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  console.log("[sms-twilio] REST Messages send", {
    to,
    bodyLen: body.length,
    outboundMode: useMessagingService ? "MessagingServiceSid" : "From",
    twilioSmsFrom: useMessagingService ? fromOrMsid : fromOrMsid,
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
      console.error("[sms-twilio] REST error", errMsg);
      return { ok: false, error: errMsg };
    }

    let json: { sid?: string };
    try {
      json = JSON.parse(rawText) as { sid?: string };
    } catch {
      console.error("[sms-twilio] success response not JSON", rawText.slice(0, 400));
      return { ok: false, error: "Twilio response was not valid JSON" };
    }

    const messageSid = typeof json.sid === "string" && json.sid.trim() !== "" ? json.sid.trim() : null;
    if (!messageSid) {
      return { ok: false, error: "Twilio response missing Message sid" };
    }

    console.log("[sms-twilio] REST ok", { messageSid, outboundMode: useMessagingService ? "MessagingServiceSid" : "From" });
    return { ok: true, messageSid };
  } catch (e) {
    console.error("[sms-twilio] REST exception", e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
