export type SendSmsParams = {
  to: string;
  body: string;
};

export type SendSmsResult =
  | { ok: true; messageSid: string }
  | { ok: false; error: string };

/**
 * Twilio Programmable Messaging (REST). Requires TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_SMS_FROM.
 * Returns Twilio MessageSid on success for durable logging (messages.external_message_sid).
 */
export async function sendSms(params: SendSmsParams): Promise<SendSmsResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  const from = process.env.TWILIO_SMS_FROM?.trim();
  const to = params.to.trim();
  const body = params.body.trim();

  if (!accountSid || !authToken || !from) {
    return { ok: false, error: "Twilio SMS credentials not configured" };
  }
  if (!to || !body) {
    return { ok: false, error: "to and body are required" };
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Messages.json`;
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");

  console.log("[twilio/send-sms] sending", { to, from, body });

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ To: to, From: from, Body: body }).toString(),
    });

    if (!res.ok) {
      const text = await res.text();
      console.error("[twilio/send-sms]", res.status, text);
      return { ok: false, error: text };
    }

    const json = (await res.json()) as { sid?: string };
    const messageSid = typeof json.sid === "string" && json.sid.trim() !== "" ? json.sid.trim() : null;
    if (!messageSid) {
      return { ok: false, error: "Twilio response missing Message sid" };
    }

    return { ok: true, messageSid };
  } catch (e) {
    console.error("[twilio/send-sms]", e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
