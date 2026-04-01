function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * TwiML: bidirectional Media Stream for OpenAI Realtime bridge (Twilio ↔ your WSS server).
 * @see https://www.twilio.com/docs/voice/twiml/stream
 */
export function buildRealtimeConnectStreamTwiml(input: {
  streamWssUrl: string;
  statusCallbackUrl?: string;
}): string {
  const { streamWssUrl, statusCallbackUrl } = input;
  const url = escapeXml(streamWssUrl);
  const statusAttr =
    statusCallbackUrl && statusCallbackUrl.trim()
      ? ` statusCallback="${escapeXml(statusCallbackUrl.trim())}" statusCallbackMethod="POST"`
      : "";
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Connect>
    <Stream url="${url}" track="both_tracks"${statusAttr}>
      <Parameter name="to" value="{{To}}" />
      <Parameter name="from" value="{{From}}" />
    </Stream>
  </Connect>
</Response>`.trim();
}
