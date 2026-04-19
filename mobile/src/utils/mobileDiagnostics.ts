import { mobileDiagnosticsEnabled } from '../config/env';

/** Verbose push/voice/bridge logs — off in release unless EXPO_PUBLIC_MOBILE_DIAGNOSTICS=1. */
export function diagWarn(...args: unknown[]): void {
  if (mobileDiagnosticsEnabled) console.warn(...args);
}

export function diagInfo(...args: unknown[]): void {
  if (mobileDiagnosticsEnabled) console.info(...args);
}
