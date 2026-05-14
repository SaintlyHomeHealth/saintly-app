/**
 * Options passed to `new Device(token, opts)` in the browser.
 * `edge` is optional — when unset, Twilio chooses the default region.
 */
export function buildTwilioVoiceJsDeviceOptions(): Record<string, unknown> {
  const out: Record<string, unknown> = { logLevel: "error" };
  const edge =
    typeof process !== "undefined" && typeof process.env.NEXT_PUBLIC_TWILIO_VOICE_JS_EDGE === "string"
      ? process.env.NEXT_PUBLIC_TWILIO_VOICE_JS_EDGE.trim()
      : "";
  if (edge) {
    out.edge = edge;
  }
  return out;
}

export function readTwilioVoiceJsEdgeLabel(): string | null {
  const edge =
    typeof process !== "undefined" && typeof process.env.NEXT_PUBLIC_TWILIO_VOICE_JS_EDGE === "string"
      ? process.env.NEXT_PUBLIC_TWILIO_VOICE_JS_EDGE.trim()
      : "";
  return edge || null;
}
