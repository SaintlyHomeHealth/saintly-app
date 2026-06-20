/**
 * Opt-in client softphone diagnostics (browser). Set NEXT_PUBLIC_SOFTPHONE_DEBUG=1 to enable.
 * Default production path stays quiet for Twilio / inbound-caller / hangup tracing.
 */
export function softphoneClientDebugEnabled(): boolean {
  return process.env.NEXT_PUBLIC_SOFTPHONE_DEBUG === "1";
}

export function softphoneDevLog(...args: unknown[]): void {
  if (!softphoneClientDebugEnabled()) return;
  console.log(...args);
}

export function softphoneDevWarn(...args: unknown[]): void {
  if (!softphoneClientDebugEnabled()) return;
  console.warn(...args);
}

/** Structured inbound-answer tracing (always logged — used when diagnosing answer failures). */
export function inboundAnswerLog(event: string, payload?: Record<string, unknown>): void {
  console.log("[softphone][inbound-answer]", event, payload ?? {});
}

/** Best-effort JWT `exp` (seconds) for Twilio access token diagnostics. */
export function readJwtExpSeconds(token: string | null | undefined): number | null {
  const t = (token ?? "").trim();
  if (!t) return null;
  const parts = t.split(".");
  if (parts.length < 2) return null;
  try {
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
    const payload = JSON.parse(atob(b64 + pad)) as { exp?: unknown };
    return typeof payload.exp === "number" && Number.isFinite(payload.exp) ? payload.exp : null;
  } catch {
    return null;
  }
}
