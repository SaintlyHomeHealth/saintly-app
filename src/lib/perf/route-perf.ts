/**
 * Opt-in timing for RSC routes and the workspace softphone client. Set
 * NEXT_PUBLIC_ROUTE_PERF=1 for one-line `[route-perf]` logs. No output when unset.
 */
export function routePerfEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ROUTE_PERF === "1";
}

/** Start marker (ms since epoch); 0 when perf is off. */
export function routePerfStart(): number {
  if (!routePerfEnabled()) return 0;
  return Date.now();
}

export function routePerfLog(segment: string, startedAtMs: number): void {
  if (!routePerfEnabled()) return;
  const ms = Date.now() - startedAtMs;
  console.info(`[route-perf] ${segment} ${ms.toFixed(0)}ms`);
}
