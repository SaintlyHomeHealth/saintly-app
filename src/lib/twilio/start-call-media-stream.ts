/**
 * Start a Twilio Media Stream on an in-progress Call (REST).
 * Wire the WSS endpoint to your OpenAI Realtime bridge (e.g. scripts/twilio-openai-realtime-bridge.ts).
 * @see https://www.twilio.com/docs/voice/api/call-stream
 */

export type StartCallStreamResult = { ok: true; streamSid?: string } | { ok: false; error: string };

/**
 * POST /2010-04-01/Accounts/{AccountSid}/Calls/{CallSid}/Streams.json
 */
export async function startCallMediaStream(input: {
  callSid: string;
  /** wss://… — must be reachable by Twilio */
  wssUrl: string;
  track?: "inbound_track" | "outbound_track" | "both_tracks";
}): Promise<StartCallStreamResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!accountSid || !authToken) {
    return { ok: false, error: "TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not configured" };
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Calls/${encodeURIComponent(input.callSid)}/Streams.json`;

  const body = new URLSearchParams();
  body.set("Url", input.wssUrl);
  body.set("Track", input.track ?? "both_tracks");

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });

  const text = await res.text();
  if (!res.ok) {
    const err = text.trim() || `HTTP ${res.status}`;
    return { ok: false, error: err.length > 8000 ? `${err.slice(0, 8000)}…(truncated)` : err };
  }
  try {
    const j = JSON.parse(text) as { sid?: string };
    return { ok: true, streamSid: j.sid };
  } catch {
    return { ok: true };
  }
}
