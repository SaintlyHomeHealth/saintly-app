/**
 * Twilio Programmable Voice — Real-Time Transcriptions (REST).
 * @see https://www.twilio.com/docs/voice/api/realtime-transcription-resource
 */

export type RealtimeTranscriptionTrack = "inbound_track" | "outbound_track" | "both_tracks";

export type CreateRealtimeTranscriptionResult =
  | { ok: true; transcriptionSid: string }
  | { ok: false; error: string };

/**
 * POST /2010-04-01/Accounts/{AccountSid}/Calls/{CallSid}/Transcriptions.json
 */
export async function createRealtimeTranscription(input: {
  callSid: string;
  track: RealtimeTranscriptionTrack;
  /** Required — Twilio POSTs transcription-started, transcription-content, transcription-stopped, transcription-error */
  statusCallbackUrl: string;
  /** Optional stable id — use to stop via API (Sid or name) */
  name?: string;
  languageCode?: string;
  /** Final utterances only — fewer DB writes; set false for partial streaming text */
  partialResults?: boolean;
}): Promise<CreateRealtimeTranscriptionResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!accountSid || !authToken) {
    return { ok: false, error: "TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not configured" };
  }

  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Calls/${encodeURIComponent(input.callSid)}/Transcriptions.json`;

  const body = new URLSearchParams();
  body.set("Track", input.track);
  body.set("StatusCallbackUrl", input.statusCallbackUrl);
  body.set("StatusCallbackMethod", "POST");
  if (input.name) body.set("Name", input.name);
  body.set("LanguageCode", input.languageCode?.trim() || "en-US");
  body.set("PartialResults", input.partialResults === true ? "true" : "false");

  console.log(
    "[twilio_rt]",
    JSON.stringify({
      step: "twilio_rt_step_01_twilio_request_sent",
      twilio_rest_url: url,
      call_sid: input.callSid,
      track: input.track,
      status_callback_url_exact: input.statusCallbackUrl,
      status_callback_host: (() => {
        try {
          return new URL(input.statusCallbackUrl).host;
        } catch {
          return null;
        }
      })(),
    })
  );

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
    const clipped = err.length > 4000 ? `${err.slice(0, 4000)}…` : err;
    console.log(
      "[twilio_rt]",
      JSON.stringify({
        step: "twilio_rt_step_02_twilio_response_received",
        http_status: res.status,
        ok: false,
        twilio_error_body: clipped,
      })
    );
    return { ok: false, error: clipped };
  }
  try {
    const j = JSON.parse(text) as { sid?: string };
    const sid = typeof j.sid === "string" && j.sid.startsWith("GT") ? j.sid : null;
    if (!sid) {
      console.log(
        "[twilio_rt]",
        JSON.stringify({
          step: "twilio_rt_step_02_twilio_response_received",
          http_status: res.status,
          ok: false,
          parse_error: "transcription_create_missing_sid",
          response_body_preview: text.length > 800 ? `${text.slice(0, 800)}…` : text,
        })
      );
      return { ok: false, error: "transcription_create_missing_sid" };
    }
    console.log(
      "[twilio_rt]",
      JSON.stringify({
        step: "twilio_rt_step_02_twilio_response_received",
        http_status: res.status,
        ok: true,
        transcription_sid: sid,
      })
    );
    return { ok: true, transcriptionSid: sid };
  } catch {
    console.log(
      "[twilio_rt]",
      JSON.stringify({
        step: "twilio_rt_step_02_twilio_response_received",
        http_status: res.status,
        ok: false,
        parse_error: "transcription_create_invalid_json",
        response_body_preview: text.length > 800 ? `${text.slice(0, 800)}…` : text,
      })
    );
    return { ok: false, error: "transcription_create_invalid_json" };
  }
}

export type StopRealtimeTranscriptionResult = { ok: true } | { ok: false; error: string };

/**
 * POST /2010-04-01/Accounts/{AccountSid}/Calls/{CallSid}/Transcriptions/{Sid}.json
 * Sid may be the transcription GT… sid or the Name given at create.
 */
export async function stopRealtimeTranscription(input: {
  callSid: string;
  transcriptionSidOrName: string;
}): Promise<StopRealtimeTranscriptionResult> {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!accountSid || !authToken) {
    return { ok: false, error: "TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN not configured" };
  }

  const sidOrName = encodeURIComponent(input.transcriptionSidOrName.trim());
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(accountSid)}/Calls/${encodeURIComponent(input.callSid)}/Transcriptions/${sidOrName}.json`;

  const body = new URLSearchParams();
  body.set("Status", "stopped");

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
    return { ok: false, error: err.length > 4000 ? `${err.slice(0, 4000)}…` : err };
  }
  return { ok: true };
}
