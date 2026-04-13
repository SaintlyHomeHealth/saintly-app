/**
 * Twilio Media Streams REST `Url` and TwiML `<Stream url="…">` must be a **full** WebSocket URL
 * including path — not just `wss://host`. Example (default bridge path):
 *   `wss://your-railway-service.up.railway.app/twilio/realtime-stream`
 *
 * Env precedence: `TWILIO_SOFTPHONE_MEDIA_STREAM_WSS_URL`, then `TWILIO_REALTIME_MEDIA_STREAM_WSS_URL`
 * so one Railway bridge can serve both inbound AI and workspace softphone.
 */
export function resolveTwilioMediaStreamWssUrl(): string {
  const primary = process.env.TWILIO_SOFTPHONE_MEDIA_STREAM_WSS_URL?.trim();
  const fallback = process.env.TWILIO_REALTIME_MEDIA_STREAM_WSS_URL?.trim();
  return (primary || fallback || "").replace(/\/$/, "");
}

/**
 * Appends query params the realtime bridge reads to route transcript rows and avoid
 * mixing legs. `transcript_external_id` is always the workspace `phone_calls.external_call_id`
 * (Client/WebRTC CallSid), even when the Twilio stream is on the PSTN leg.
 */
export function appendSoftphoneTranscriptStreamParams(
  baseWss: string,
  opts: { transcriptExternalId: string; inputRole: "staff" | "caller" }
): string {
  const trimmed = baseWss.trim().replace(/\/$/, "");
  if (!trimmed.startsWith("wss://")) return trimmed;
  const u = new URL(trimmed.replace(/^wss:\/\//i, "https://"));
  u.searchParams.set("transcript_external_id", opts.transcriptExternalId);
  u.searchParams.set("input_role", opts.inputRole);
  u.searchParams.set("softphone_transcript", "1");
  return u.toString().replace(/^https:\/\//i, "wss://");
}

/**
 * Inbound AI receptionist TwiML `<Stream url>` — marks the bridge WebSocket as **conversational**
 * (assistant, tools, transfers). Without this, the bridge **fail-closes** to transcript-only (safe).
 * @see scripts/twilio-openai-realtime-bridge.ts `parseTranscriptWsQuery` / `inbound_ai`
 */
export function appendInboundReceptionistAiStreamParam(baseWss: string): string {
  const trimmed = baseWss.trim().replace(/\/$/, "");
  if (!trimmed.startsWith("wss://")) return trimmed;
  const u = new URL(trimmed.replace(/^wss:\/\//i, "https://"));
  u.searchParams.set("inbound_ai", "1");
  return u.toString().replace(/^https:\/\//i, "wss://");
}
