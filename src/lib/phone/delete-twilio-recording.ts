import "server-only";

import twilio from "twilio";

const SID_RE = /^RE[0-9a-f]{32}$/i;

/**
 * Best-effort Twilio Recording delete (voicemail cleanup). Logs and returns false on failure.
 */
export async function deleteTwilioRecordingBySid(recordingSid: string): Promise<boolean> {
  const sid = typeof recordingSid === "string" ? recordingSid.trim() : "";
  if (!SID_RE.test(sid)) {
    console.warn("[twilio-recording-delete] invalid sid");
    return false;
  }
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!accountSid || !authToken) {
    console.warn("[twilio-recording-delete] missing Twilio credentials");
    return false;
  }
  try {
    const client = twilio(accountSid, authToken);
    await client.recordings(sid).remove();
    return true;
  } catch (e) {
    console.warn("[twilio-recording-delete] remove failed", {
      sid: sid.slice(0, 8),
      error: e instanceof Error ? e.message : String(e),
    });
    return false;
  }
}
