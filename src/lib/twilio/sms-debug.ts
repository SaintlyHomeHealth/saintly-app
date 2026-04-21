/**
 * Opt-in SMS debug logging. Set `SMS_DEBUG=true` (or `1` / `yes`) in the server environment.
 * Production stays quiet unless this flag is set.
 */

function truthyEnv(val: string | undefined): boolean {
  if (val == null || val === "") return false;
  const v = val.trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

/** Server / Node (server actions, API routes, `send-sms.ts`): uses `SMS_DEBUG`. */
export function isSmsDebugEnabled(): boolean {
  return truthyEnv(process.env.SMS_DEBUG);
}

/** Logs only when {@link isSmsDebugEnabled} is true. */
export function logSmsDebug(message: string, data?: Record<string, unknown>): void {
  if (!isSmsDebugEnabled()) return;
  if (data !== undefined) {
    console.log(message, data);
  } else {
    console.log(message);
  }
}
