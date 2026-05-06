import { SMS_SEND_FRIENDLY_TRY_AGAIN } from "@/lib/phone/sms-send-user-copy";

/**
 * Maps server `error` strings for SMS composers before showing them in the UI.
 *
 * - **Technical / provider / system** cues (Twilio, HTTP, Postgres, Supabase, etc.) →
 *   {@link SMS_SEND_FRIENDLY_TRY_AGAIN} only. Never surface raw API text, stacks, or PHI.
 * - **User-actionable** copy from our server (missing phone, not authorized, message too long, …)
 *   passes through unchanged as long as it does not look technical.
 */
export function smsThreadComposerUserVisibleError(raw: string | null | undefined): string {
  const s = (raw ?? "").trim();
  if (!s) return SMS_SEND_FRIENDLY_TRY_AGAIN;

  const lower = s.toLowerCase();
  if (
    lower.includes("twilio") ||
    lower.includes("[http") ||
    lower.includes("postgres") ||
    lower.includes("pgrst") ||
    lower.includes("supabase") ||
    lower.includes("jwt") ||
    lower.includes("econn") ||
    lower.includes("etimedout") ||
    lower.includes("fetch failed") ||
    lower.includes("twilio_fetch_timeout") ||
    lower.includes("network") ||
    lower.includes("violates") ||
    lower.includes("constraint") ||
    lower.includes("42501") ||
    lower.includes("42p01")
  ) {
    return SMS_SEND_FRIENDLY_TRY_AGAIN;
  }

  return s;
}
