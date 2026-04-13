/**
 * Temporary correlation logs for softphone vs AI receptionist debugging.
 * Search logs for `[twilio-voice-trace]` (JSON lines).
 *
 * Remove or gate behind env once the failing path is identified.
 */

export type TwilioVoiceTraceLogInput = {
  /** Logical handler, e.g. `POST /api/twilio/voice/softphone` */
  route: string;
  /** Twilio CallSid for the browser Client leg when applicable */
  client_call_sid: string | null;
  /** PSTN child leg CallSid when known (conference REST leg, etc.) */
  pstn_call_sid: string | null;
  /** True when this handler runs OpenAI realtime TwiML, ai-answer/gather, or bridge stores agent lines as receptionist */
  ai_path_entered: boolean;
  /** True when this handler intentionally routes staff softphone (client: From/To) away from AI */
  softphone_bypass_path_entered: boolean;
  /** Short TwiML shape, e.g. `Redirect+realtime` or `Dial>Conference` */
  twiml_summary: string;
  /** Optional sub-branch label */
  branch?: string;
  /** Parent CallSid when Twilio sends it */
  parent_call_sid?: string | null;
};

function redactUri(s: string | undefined | null): string | null {
  if (s == null || s === "") return null;
  const t = s.trim();
  if (t.toLowerCase().startsWith("client:")) {
    const id = t.slice("client:".length).trim();
    return id.length > 8 ? `client:…${id.slice(-6)}` : "client:…";
  }
  const digits = t.replace(/\D/g, "");
  if (digits.length >= 10) return `…${digits.slice(-4)}`;
  return t.length > 24 ? `${t.slice(0, 12)}…` : t;
}

/**
 * Compact TwiML intent for logs (not full XML).
 */
export function summarizeTwimlResponse(xml: string): string {
  const t = xml.replace(/\s+/g, " ").trim();
  const parts: string[] = [];
  if (/<Redirect\s/i.test(t)) parts.push("Redirect");
  if (/<Connect>/i.test(t)) parts.push("Connect");
  if (/<Stream[\s>/]/i.test(t)) parts.push("Stream");
  if (/<Gather\s/i.test(t)) parts.push("Gather");
  if (/<Dial[\s>/]/i.test(t)) {
    if (/<Conference/i.test(t)) parts.push("Dial>Conference");
    else if (/<Number/i.test(t)) parts.push("Dial>Number");
    else if (/<Client/i.test(t)) parts.push("Dial>Client");
    else parts.push("Dial");
  }
  if (/<Say\s/i.test(t)) parts.push("Say");
  if (/<Hangup/i.test(t)) parts.push("Hangup");
  if (/^<\?xml[^>]*>\s*<Response>\s*<\/Response>\s*$/i.test(t) || t === "<Response></Response>") {
    parts.push("empty_Response");
  }
  return parts.length ? [...new Set(parts)].join("+") : "(unrecognized)";
}

export function logTwilioVoiceTrace(
  input: TwilioVoiceTraceLogInput & {
    from_raw?: string | null;
    to_raw?: string | null;
  }
): void {
  const { from_raw, to_raw, ...rest } = input;
  console.log(
    "[twilio-voice-trace]",
    JSON.stringify({
      ...rest,
      from_redacted: redactUri(from_raw ?? null),
      to_redacted: redactUri(to_raw ?? null),
    })
  );
}
