import twilio from "twilio";

function twilioBasicAuthHeader(accountSid: string, authToken: string): string {
  return `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString("base64")}`;
}

async function parseTwilioJson(res: Response): Promise<{ ok: boolean; status: number; body: unknown; text: string }> {
  const text = await res.text();
  let body: unknown = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { raw: text.slice(0, 200) };
  }
  return { ok: res.ok, status: res.status, body, text };
}

function twilioRestError(body: unknown): string {
  if (body && typeof body === "object" && "message" in body && typeof (body as { message?: unknown }).message === "string") {
    return (body as { message: string }).message;
  }
  return "Twilio request failed";
}

/**
 * Start a **conference** recording (mixed room audio) via REST.
 * Twilio does not expose `create` on the Node helper for this subresource; we POST the list URL.
 */
export async function startConferenceRecordingRest(params: {
  accountSid: string;
  authToken: string;
  conferenceSid: string;
}): Promise<{ recordingSid: string } | { error: string }> {
  const { accountSid, authToken, conferenceSid } = params;
  const path = `/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Conferences/${encodeURIComponent(conferenceSid)}/Recordings.json`;
  const res = await fetch(`https://api.twilio.com${path}`, {
    method: "POST",
    headers: {
      Authorization: twilioBasicAuthHeader(accountSid, authToken),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "",
  });
  const parsed = await parseTwilioJson(res);
  if (!parsed.ok) {
    return { error: twilioRestError(parsed.body) };
  }
  const sid =
    parsed.body &&
    typeof parsed.body === "object" &&
    "sid" in parsed.body &&
    typeof (parsed.body as { sid?: unknown }).sid === "string"
      ? (parsed.body as { sid: string }).sid
      : "";
  if (!sid.startsWith("RE")) {
    return { error: "Twilio did not return a recording SID" };
  }
  return { recordingSid: sid };
}

export async function stopConferenceRecordingRest(params: {
  accountSid: string;
  authToken: string;
  conferenceSid: string;
  recordingSid: string;
}): Promise<{ ok: true } | { error: string }> {
  const { accountSid, authToken, conferenceSid, recordingSid } = params;
  const sidSeg = recordingSid === "CURRENT" ? "Twilio.CURRENT" : encodeURIComponent(recordingSid);
  const path = `/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Conferences/${encodeURIComponent(conferenceSid)}/Recordings/${sidSeg}.json`;
  const body = new URLSearchParams({ Status: "stopped" });
  const res = await fetch(`https://api.twilio.com${path}`, {
    method: "POST",
    headers: {
      Authorization: twilioBasicAuthHeader(accountSid, authToken),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: body.toString(),
  });
  const parsed = await parseTwilioJson(res);
  if (!parsed.ok) {
    return { error: twilioRestError(parsed.body) };
  }
  return { ok: true };
}

export async function startCallLegRecording(params: {
  accountSid: string;
  authToken: string;
  callSid: string;
}): Promise<{ recordingSid: string } | { error: string }> {
  const client = twilio(params.accountSid, params.authToken);
  try {
    const rec = await client.calls(params.callSid).recordings.create({
      recordingChannels: "mono",
      recordingTrack: "both",
    });
    const sid = rec.sid;
    if (!sid || !sid.startsWith("RE")) {
      return { error: "Twilio did not return a recording SID" };
    }
    return { recordingSid: sid };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: msg.slice(0, 400) };
  }
}

export async function stopCallLegRecording(params: {
  accountSid: string;
  authToken: string;
  callSid: string;
  recordingSid: string;
}): Promise<{ ok: true } | { error: string }> {
  const client = twilio(params.accountSid, params.authToken);
  const sidSeg = params.recordingSid === "CURRENT" ? "Twilio.CURRENT" : params.recordingSid;
  try {
    await client.calls(params.callSid).recordings(sidSeg).update({ status: "stopped" });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: msg.slice(0, 400) };
  }
}

export async function fetchRecordingStatus(params: {
  accountSid: string;
  authToken: string;
  callSid: string;
  recordingSid: string;
}): Promise<{ status: string | null; duration: string | null } | { error: string }> {
  const client = twilio(params.accountSid, params.authToken);
  try {
    const rec = await client.calls(params.callSid).recordings(params.recordingSid).fetch();
    return { status: rec.status ?? null, duration: rec.duration ?? null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: msg.slice(0, 200) };
  }
}

export async function fetchConferenceRecordingStatus(params: {
  accountSid: string;
  authToken: string;
  conferenceSid: string;
  recordingSid: string;
}): Promise<{ status: string | null; duration: string | null } | { error: string }> {
  const client = twilio(params.accountSid, params.authToken);
  try {
    const rec = await client.conferences(params.conferenceSid).recordings(params.recordingSid).fetch();
    return { status: rec.status ?? null, duration: rec.duration ?? null };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { error: msg.slice(0, 200) };
  }
}
