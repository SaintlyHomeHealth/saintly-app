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
