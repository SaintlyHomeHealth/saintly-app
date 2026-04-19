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
