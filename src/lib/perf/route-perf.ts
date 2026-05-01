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

export async function routePerfTimed<T>(label: string, fn: () => PromiseLike<T>): Promise<T> {
  const t0 = Date.now();
  try {
    return await fn();
  } finally {
    routePerfStep(label, Date.now() - t0);
  }
}

export function routePerfClientMark(label: string, startedAtMs: number): void {
  if (!routePerfEnabled()) return;
  const now =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  const ms = Math.max(0, now - startedAtMs);
  console.info(`[route-perf] client ${label} ${ms.toFixed(0)}ms`);
}

/** Bottom nav: time from tap handler start to immediately after `router.push` returns (opt-in). */
export function routePerfClientNavTapToPush(startedAtPerfMs: number): void {
  if (!routePerfEnabled()) return;
  const now =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  const ms = Math.max(0, now - startedAtPerfMs);
  console.info(`[route-perf] client nav:tap→push ${ms.toFixed(1)}ms`);
}

/** Bottom nav `<Link>`: sync work in click handler through next microtask (opt-in). */
export function routePerfClientNavTapToMicrotask(startedAtPerfMs: number): void {
  if (!routePerfEnabled()) return;
  queueMicrotask(() => {
    const now =
      typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now();
    const ms = Math.max(0, now - startedAtPerfMs);
    console.info(`[route-perf] client nav:tap→microtask ${ms.toFixed(1)}ms`);
  });
}

/** When `usePathname()` updates after a bottom-nav tap (opt-in). */
export function routePerfClientNavTapToPathnameSettled(
  startedAtPerfMs: number,
  nextPathname: string
): void {
  if (!routePerfEnabled()) return;
  const now =
    typeof performance !== "undefined" && typeof performance.now === "function"
      ? performance.now()
      : Date.now();
  const ms = Math.max(0, now - startedAtPerfMs);
  console.info(`[route-perf] client nav:tap→pathname ${ms.toFixed(1)}ms path=${nextPathname}`);
}

/** Opt-in render counter for temporary perf triage. Enable with NEXT_PUBLIC_ROUTE_PERF=1. */
export function routePerfRenderCount(label: string): void {
  if (!routePerfEnabled()) return;
  console.count(`RENDER: ${label}`);
}
