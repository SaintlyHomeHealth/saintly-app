/**
 * Opt-in timing for RSC routes and the workspace softphone client. Set
 * NEXT_PUBLIC_ROUTE_PERF=1 for one-line `[route-perf]` total logs.
 *
 * Set ROUTE_PERF_STEPS=1 (server) for per-step DB segment timings on instrumented routes.
 * Steps log as `[route-perf] step <name> <ms>ms` in addition to totals when totals are enabled.
 */
export function routePerfEnabled(): boolean {
  return process.env.NEXT_PUBLIC_ROUTE_PERF === "1";
}

/** Per-query / per-segment timings (server env; not required in browser bundle). */
export function routePerfStepsEnabled(): boolean {
  return process.env.ROUTE_PERF_STEPS === "1";
}

/** Start marker (ms since epoch); 0 when neither total nor step logging is on. */
export function routePerfStart(): number {
  if (!routePerfEnabled() && !routePerfStepsEnabled()) return 0;
  return Date.now();
}

export function routePerfLog(segment: string, startedAtMs: number): void {
  if (!routePerfEnabled() && !routePerfStepsEnabled()) return;
  if (!startedAtMs) return;
  const ms = Date.now() - startedAtMs;
  console.info(`[route-perf] ${segment} total=${ms.toFixed(0)}ms`);
}

/** One step duration (only when ROUTE_PERF_STEPS=1). */
export function routePerfStep(label: string, durationMs: number): void {
  if (!routePerfStepsEnabled()) return;
  console.info(`[route-perf] step ${label} ${durationMs.toFixed(0)}ms`);
}

export async function routePerfTimed<T>(label: string, fn: () => Promise<T>): Promise<T> {
  const t0 = Date.now();
  try {
    return await fn();
  } finally {
    routePerfStep(label, Date.now() - t0);
  }
}
