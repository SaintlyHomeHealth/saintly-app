/**
 * Webhook URL for Twilio numbers purchased via Saintly (voiceUrl). Behavior matches
 * `POST /api/twilio/voice/inbound-ring` (staff-assigned DID routing when applicable).
 */
export { POST } from "../inbound-ring/route";

export function GET() {
  return new Response("OK", { status: 200, headers: { "Content-Type": "text/plain; charset=utf-8" } });
}
